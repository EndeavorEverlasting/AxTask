#!/usr/bin/env node
/**
 * Read-only Neon / Postgres size audit with security_events forensics.
 *
 * Prints — in both human-readable text and JSON at the tail — the data we need
 * to decide what to reclaim:
 *
 *   - Total database size.
 *   - Top 20 tables by total size (heap + indexes + toast).
 *   - Top 20 indexes by size.
 *   - Never-used indexes (idx_scan = 0, excluding primary/unique indexes).
 *   - Row counts for known append-only "whale" tables.
 *   - security_events deep forensics (event_type breakdown, timestamps, stats).
 *   - Migration 9999 trigger/ledger status.
 *
 * Safe to run against production; every statement is a SELECT.
 *
 * Usage:  node scripts/db-size-audit.mjs [--json] [--forensics]
 * Env:    DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;

const jsonOnly = process.argv.includes("--json");
const forensicsMode = process.argv.includes("--forensics");

const WHALE_TABLES = [
  "security_events",
  "security_logs",
  "archetype_rollup_daily",
  "archetype_markov_daily",
  "idempotency_keys",
  "mfa_challenges",
  "password_reset_tokens",
  "task_import_fingerprints",
  "invoice_events",
  "premium_events",
  "study_review_events",
  "usage_snapshots",
  "user_location_events",
  "ai_interactions",
  "applied_sql_migrations",
];

function log(...args) {
  if (!jsonOnly) console.error(...args);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[audit] DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  let forensicsIncomplete = false;
  const report = {
    timestamp: new Date().toISOString(),
    database: {},
    topTables: [],
    topIndexes: [],
    neverUsedIndexes: [],
    whaleRowCounts: {},
    securityEventsForensics: null,
  };

  try {
    const sizeQ = await client.query(`
      SELECT
        current_database() AS database,
        pg_database_size(current_database()) AS bytes,
        pg_size_pretty(pg_database_size(current_database())) AS pretty
    `);
    report.database = sizeQ.rows[0];
    log(
      `\n[audit] database=${report.database.database}  size=${report.database.pretty}  (${report.database.bytes} bytes)`,
    );

    const topTablesQ = await client.query(`
      SELECT
        n.nspname AS schema,
        c.relname AS table,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
        pg_relation_size(c.oid) AS heap_bytes,
        pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
        pg_total_relation_size(c.oid) - pg_relation_size(c.oid) AS indexes_and_toast_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 20
    `);
    report.topTables = topTablesQ.rows;

    if (!jsonOnly) {
      log("\n[audit] Top 20 tables by total size:");
      log("  #   total       heap        idx+toast   schema.table");
      topTablesQ.rows.forEach((r, i) => {
        const idxPretty = formatBytes(Number(r.indexes_and_toast_bytes));
        log(
          `  ${String(i + 1).padStart(2)}  ${r.total_pretty.padEnd(9)}  ${r.heap_pretty.padEnd(9)}  ${idxPretty.padEnd(9)}   ${r.schema}.${r.table}`,
        );
      });
    }

    const topIndexesQ = await client.query(`
      SELECT
        n.nspname AS schema,
        t.relname AS table,
        i.relname AS index,
        pg_relation_size(i.oid) AS bytes,
        pg_size_pretty(pg_relation_size(i.oid)) AS pretty
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
      WHERE i.relkind = 'i'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_relation_size(i.oid) DESC
      LIMIT 20
    `);
    report.topIndexes = topIndexesQ.rows;

    if (!jsonOnly) {
      log("\n[audit] Top 20 indexes by size:");
      log("  #   size        schema.table.index");
      topIndexesQ.rows.forEach((r, i) => {
        log(
          `  ${String(i + 1).padStart(2)}  ${r.pretty.padEnd(9)}   ${r.schema}.${r.table}.${r.index}`,
        );
      });
    }

    const neverUsedQ = await client.query(`
      SELECT
        s.schemaname AS schema,
        s.relname AS table,
        s.indexrelname AS index,
        pg_relation_size(s.indexrelid) AS bytes,
        pg_size_pretty(pg_relation_size(s.indexrelid)) AS pretty,
        s.idx_scan AS scans
      FROM pg_stat_user_indexes s
      JOIN pg_index i ON i.indexrelid = s.indexrelid
      WHERE s.idx_scan = 0
        AND NOT i.indisprimary
        AND NOT i.indisunique
        AND s.schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_relation_size(s.indexrelid) DESC
    `);
    report.neverUsedIndexes = neverUsedQ.rows;

    if (!jsonOnly) {
      log(`\n[audit] Never-used non-unique indexes (${neverUsedQ.rows.length}):`);
      if (neverUsedQ.rows.length === 0) log("  (none)");
      else {
        for (const r of neverUsedQ.rows) {
          log(`  ${r.pretty.padEnd(9)}   ${r.schema}.${r.table}.${r.index}`);
        }
      }
    }

    log("\n[audit] Row counts for known whale tables:");
    for (const table of WHALE_TABLES) {
      if (forensicsMode && table === "security_events") {
        report.whaleRowCounts[table] = {
          deferred: "single-pass security_events forensic aggregate",
        };
        if (!jsonOnly) {
          log(
            `  ${table.padEnd(30)} (deferred to single-pass forensic aggregate)`,
          );
        }
        continue;
      }

      try {
        const rc = await client.query(
          `SELECT COUNT(*)::bigint AS n FROM "${table}"`,
        );
        const n = Number(rc.rows[0].n);
        report.whaleRowCounts[table] = n;
        if (!jsonOnly) log(`  ${table.padEnd(30)} ${n.toLocaleString()} rows`);
      } catch (err) {
        report.whaleRowCounts[table] = { error: err.message };
        if (!jsonOnly) log(`  ${table.padEnd(30)} (skipped: ${err.message})`);
      }
    }

    if (forensicsMode) {
      log("\n[audit] === SECURITY_EVENTS FORENSICS ===");
      report.securityEventsForensics = await runSecurityEventsForensics(client, log);
      if (report.securityEventsForensics.eventTypeAggregationComplete) {
        report.whaleRowCounts.security_events =
          report.securityEventsForensics.totalRowsFromEventTypes;
      } else {
        report.whaleRowCounts.security_events = {
          error: "single-pass security_events forensic aggregate did not complete",
        };
      }
      forensicsIncomplete = !report.securityEventsForensics.evidenceComplete;
    }
  } finally {
    client.release();
    await pool.end();
  }

  process.stdout.write(JSON.stringify(report, bigIntReplacer, 2));
  if (!jsonOnly) process.stdout.write("\n");

  if (forensicsIncomplete) {
    console.error(
      "[audit] forensic evidence is incomplete; refusing to report R1 success",
    );
    process.exitCode = 2;
  }
}

async function runSecurityEventsForensics(client, log) {
  const forensics = {
    relationSize: null,
    heapSize: null,
    indexSize: null,
    toastSize: null,
    estimatedRows: null,
    liveRows: null,
    deadRows: null,
    totalRowsFromEventTypes: null,
    eventTypeCounts: {},
    oldestNewestPerType: {},
    triggerExists: false,
    triggerEnabled: false,
    triggerEnableCode: null,
    migration9999Recorded: false,
    relationSizeCheckComplete: false,
    rowStatsCheckComplete: false,
    eventTypeAggregationComplete: false,
    triggerCheckComplete: false,
    migrationLedgerCheckComplete: false,
    evidenceComplete: false,
    errors: [],
    bloatAnalysis: {
      source: "pg_stat_user_tables",
      deadTupleRatio: null,
      classification: "insufficient-stats",
      physicalBloatBytes: null,
      note: "This audit does not manufacture physical-bloat bytes from heap/live-row averages.",
    },
  };

  // Relation size breakdown. TOAST is a separate relation, not a pg_relation_size fork.
  try {
    const relQ = await client.query(`
      SELECT
        pg_total_relation_size('public.security_events'::regclass)::bigint AS total_bytes,
        pg_relation_size('public.security_events'::regclass)::bigint AS heap_bytes,
        pg_indexes_size('public.security_events'::regclass)::bigint AS index_bytes,
        COALESCE((
          SELECT pg_total_relation_size(c.reltoastrelid)::bigint
          FROM pg_class c
          WHERE c.oid = 'public.security_events'::regclass
            AND c.reltoastrelid <> 0
        ), 0)::bigint AS toast_bytes
    `);
    const r = relQ.rows[0];
    if (!r) throw new Error("security_events relation-size query returned no row");
    forensics.relationSize = Number(r.total_bytes);
    forensics.heapSize = Number(r.heap_bytes);
    forensics.indexSize = Number(r.index_bytes);
    forensics.toastSize = Number(r.toast_bytes);
    forensics.relationSizeCheckComplete = true;
    log(
      `[audit] security_events total=${formatBytes(forensics.relationSize)} heap=${formatBytes(forensics.heapSize)} indexes=${formatBytes(forensics.indexSize)} toast=${formatBytes(forensics.toastSize)}`,
    );
  } catch (err) {
    recordForensicsError(forensics, "relation-size", err, log);
  }

  try {
    const estQ = await client.query(`
      SELECT
        c.reltuples AS estimated_rows,
        s.n_live_tup AS live_rows,
        s.n_dead_tup AS dead_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s
        ON s.relname = c.relname AND s.schemaname = n.nspname
      WHERE c.relname = 'security_events'
        AND n.nspname = 'public'
    `);
    if (estQ.rows.length === 0) {
      throw new Error("security_events row-stat query returned no row");
    }
    const r = estQ.rows[0];
    const estimate = Number(r.estimated_rows);
    forensics.estimatedRows =
      Number.isFinite(estimate) && estimate >= 0 ? Math.round(estimate) : null;
    forensics.liveRows = r.live_rows === null ? null : Number(r.live_rows);
    forensics.deadRows = r.dead_rows === null ? null : Number(r.dead_rows);
    forensics.rowStatsCheckComplete = true;
    log(
      `[audit] security_events est_rows=${forensics.estimatedRows ?? "n/a"} live=${forensics.liveRows ?? "n/a"} dead=${forensics.deadRows ?? "n/a"}`,
    );
  } catch (err) {
    recordForensicsError(forensics, "row-stats", err, log);
  }

  // security_events is the production whale. Gather exact counts and timestamp ranges
  // in one GROUP BY scan instead of a separate COUNT plus N per-type timestamp scans.
  try {
    const typeQ = await client.query(`
      SELECT
        event_type,
        COUNT(*)::bigint AS cnt,
        MIN(created_at) AS oldest,
        MAX(created_at) AS newest
      FROM public.security_events
      GROUP BY event_type
      ORDER BY cnt DESC
    `);

    let totalRows = 0;
    for (const row of typeQ.rows) {
      const key = row.event_type === null ? "<NULL>" : String(row.event_type);
      const count = Number(row.cnt);
      forensics.eventTypeCounts[key] = count;
      totalRows += count;
      forensics.oldestNewestPerType[key] = {
        oldest: row.oldest ?? null,
        newest: row.newest ?? null,
      };
    }
    forensics.totalRowsFromEventTypes = totalRows;
    forensics.eventTypeAggregationComplete = true;

    log("[audit] security_events event_type breakdown:");
    for (const [type, count] of Object.entries(forensics.eventTypeCounts)) {
      const range = forensics.oldestNewestPerType[type];
      log(
        `  ${type.padEnd(30)} ${count.toLocaleString()} rows oldest=${range.oldest ?? "n/a"} newest=${range.newest ?? "n/a"}`,
      );
    }
  } catch (err) {
    recordForensicsError(forensics, "event-type-aggregate", err, log);
  }

  try {
    const trigQ = await client.query(`
      SELECT tgname, tgenabled
      FROM pg_trigger
      WHERE tgname = 'trg_suppress_api_request_security_events'
        AND tgrelid = 'public.security_events'::regclass
        AND NOT tgisinternal
    `);
    if (trigQ.rows.length > 0) {
      forensics.triggerExists = true;
      forensics.triggerEnableCode = trigQ.rows[0].tgenabled;
      // O=enabled for origin sessions, A=always. R=replica-only is not normal-origin containment.
      forensics.triggerEnabled = ["O", "A"].includes(trigQ.rows[0].tgenabled);
    }
    forensics.triggerCheckComplete = true;
    log(
      `[audit] trigger exists=${forensics.triggerExists} enabled=${forensics.triggerEnabled} code=${forensics.triggerEnableCode ?? "n/a"}`,
    );
  } catch (err) {
    recordForensicsError(forensics, "trigger-state", err, log);
  }

  try {
    const migQ = await client.query(`
      SELECT 1 AS exists
      FROM applied_sql_migrations
      WHERE filename = '9999_disable_api_request_security_events.sql'
    `);
    forensics.migration9999Recorded = migQ.rows.length > 0;
    forensics.migrationLedgerCheckComplete = true;
    log(
      `[audit] migration 9999_disable_api_request_security_events.sql: ${forensics.migration9999Recorded ? "RECORDED" : "NOT RECORDED"}`,
    );
  } catch (err) {
    recordForensicsError(forensics, "migration-ledger", err, log);
  }

  if (forensics.liveRows !== null && forensics.deadRows !== null) {
    const denominator = forensics.liveRows + forensics.deadRows;
    const deadRatio = denominator > 0 ? forensics.deadRows / denominator : 0;
    let classification = "live-row-dominant-or-low-dead-tuple-pressure";
    if (deadRatio >= 0.2) classification = "dead-tuple-pressure";
    else if (denominator === 0) classification = "empty";

    forensics.bloatAnalysis = {
      source: "pg_stat_user_tables",
      deadTupleRatio: `${(deadRatio * 100).toFixed(1)}%`,
      classification,
      physicalBloatBytes: null,
      note: "Dead-tuple statistics can indicate pressure but do not measure reclaimable physical bytes. Compare relation size before/after logical cleanup before choosing physical reclaim.",
    };
    log(
      `[audit] stats classification=${classification} dead_tuple_ratio=${forensics.bloatAnalysis.deadTupleRatio}`,
    );
  }

  forensics.evidenceComplete = [
    forensics.relationSizeCheckComplete,
    forensics.rowStatsCheckComplete,
    forensics.eventTypeAggregationComplete,
    forensics.triggerCheckComplete,
    forensics.migrationLedgerCheckComplete,
  ].every(Boolean);

  return forensics;
}

function recordForensicsError(forensics, stage, err, log) {
  const message = err instanceof Error ? err.message : String(err);
  forensics.errors.push({ stage, message });
  log(`[audit] security_events ${stage} failed: ${message}`);
}

function bigIntReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

main().catch((err) => {
  console.error(`[audit] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
