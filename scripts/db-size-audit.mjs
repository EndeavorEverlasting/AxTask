#!/usr/bin/env node
/**
 * Read-only Neon / Postgres size audit with security_events forensics.
 *
 * Prints — in both human-readable text and JSON at the tail — the data we need
 * to decide what to reclaim in `scripts/db-reclaim.mjs`:
 *
 *   - Total database size.
 *   - Top 20 tables by total size (heap + indexes + toast).
 *   - Top 20 indexes by size.
 *   - Never-used indexes (idx_scan = 0, excluding primary keys).
 *   - Row counts for known append-only "whale" tables.
 *   - security_events deep forensics (event_type breakdown, timestamps, bloat analysis).
 *   - Migration 9999 trigger status.
 *
 * Safe to run against production; every statement is a SELECT.
 *
 * Usage:  node scripts/db-size-audit.mjs [--json] [--forensics]
 * Env:    DATABASE_URL (required)
 *
 * The `--json` flag suppresses the human-readable preamble and prints ONLY the
 * JSON document to stdout, which `db-reclaim.mjs` can consume.
 *
 * The `--forensics` flag adds the security_events deep-dive section.
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;

const jsonOnly = process.argv.includes("--json");
const forensicsMode = process.argv.includes("--forensics");

/** Tables we already know are append-only and likely candidates for reclaim. */
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
    log(`\n[audit] database=${report.database.database}  size=${report.database.pretty}  (${report.database.bytes} bytes)`);

    const topTablesQ = await client.query(`
      SELECT
        n.nspname                                    AS schema,
        c.relname                                    AS table,
        pg_total_relation_size(c.oid)                AS total_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
        pg_relation_size(c.oid)                      AS heap_bytes,
        pg_size_pretty(pg_relation_size(c.oid))      AS heap_pretty,
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
        const idx = r.indexes_and_toast_bytes;
        const idxPretty = formatBytes(Number(idx));
        log(
          `  ${String(i + 1).padStart(2)}  ${r.total_pretty.padEnd(9)}  ${r.heap_pretty.padEnd(9)}  ${idxPretty.padEnd(9)}   ${r.schema}.${r.table}`,
        );
      });
    }

    const topIndexesQ = await client.query(`
      SELECT
        n.nspname                              AS schema,
        t.relname                              AS table,
        i.relname                              AS index,
        pg_relation_size(i.oid)                AS bytes,
        pg_size_pretty(pg_relation_size(i.oid)) AS pretty
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t  ON t.oid = ix.indrelid
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
        log(`  ${String(i + 1).padStart(2)}  ${r.pretty.padEnd(9)}   ${r.schema}.${r.table}.${r.index}`);
      });
    }

    /** Never-used indexes. Skip primary keys (correctness) and unique indexes
     *  (`ux_*` convention in this repo — they enforce uniqueness even with
     *  zero scans). The DROP script reviews these by hand before applying. */
    const neverUsedQ = await client.query(`
      SELECT
        s.schemaname                           AS schema,
        s.relname                              AS table,
        s.indexrelname                         AS index,
        pg_relation_size(s.indexrelid)         AS bytes,
        pg_size_pretty(pg_relation_size(s.indexrelid)) AS pretty,
        s.idx_scan                             AS scans
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
      if (neverUsedQ.rows.length === 0) {
        log("  (none — pg_stat_user_indexes has no zero-scan non-unique indexes)");
      } else {
        log("  size        schema.table.index");
        neverUsedQ.rows.forEach((r) => {
          log(`  ${r.pretty.padEnd(9)}   ${r.schema}.${r.table}.${r.index}`);
        });
      }
    }

    log("\n[audit] Row counts for known whale tables:");
    for (const t of WHALE_TABLES) {
      try {
        const rc = await client.query(
          `SELECT COUNT(*)::bigint AS n FROM "${t}"`,
        );
        const n = Number(rc.rows[0].n);
        report.whaleRowCounts[t] = n;
        if (!jsonOnly) log(`  ${t.padEnd(30)} ${n.toLocaleString()} rows`);
      } catch (err) {
        report.whaleRowCounts[t] = { error: err.message };
        if (!jsonOnly) log(`  ${t.padEnd(30)} (skipped: ${err.message})`);
      }
    }

    // SECURITY_EVENTS FORENSICS — deep dive when --forensics flag is present
    if (forensicsMode) {
      log("\n[audit] === SECURITY_EVENTS FORENSICS ===");
      report.securityEventsForensics = await runSecurityEventsForensics(client, log);
    }
  } finally {
    client.release();
    await pool.end();
  }

  process.stdout.write(JSON.stringify(report, bigIntReplacer, 2));
  if (!jsonOnly) process.stdout.write("\n");
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
    eventTypeCounts: {},
    oldestNewestPerType: {},
    triggerExists: false,
    triggerEnabled: false,
    migration9999Recorded: false,
    bloatAnalysis: {},
  };

  // 1. Relation size breakdown
  try {
    const relQ = await client.query(`
      SELECT
        pg_total_relation_size('security_events') AS total_bytes,
        pg_relation_size('security_events') AS heap_bytes,
        pg_total_relation_size('security_events') - pg_relation_size('security_events') - pg_relation_size('security_events', 'toast') AS index_bytes,
        pg_relation_size('security_events', 'toast') AS toast_bytes
    `);
    const r = relQ.rows[0];
    forensics.relationSize = Number(r.total_bytes);
    forensics.heapSize = Number(r.heap_bytes);
    forensics.indexSize = Number(r.index_bytes);
    forensics.toastSize = Number(r.toast_bytes);
    log(`[audit] security_events total: ${formatBytes(forensics.relationSize)}  heap: ${formatBytes(forensics.heapSize)}  indexes: ${formatBytes(forensics.indexSize)}  toast: ${formatBytes(forensics.toastSize)}`);
  } catch (err) {
    log(`[audit] security_events size breakdown failed: ${err.message}`);
  }

  // 2. Row estimates from pg_class + pg_stat_user_tables
  try {
    const estQ = await client.query(`
      SELECT
        c.reltuples::bigint AS estimated_rows,
        s.n_live_tup AS live_rows,
        s.n_dead_tup AS dead_rows
      FROM pg_class c
      LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname AND s.schemaname = 'public'
      WHERE c.relname = 'security_events'
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `);
    if (estQ.rows.length > 0) {
      const r = estQ.rows[0];
      forensics.estimatedRows = r.estimated_rows ? Number(r.estimated_rows) : null;
      forensics.liveRows = r.live_rows ? Number(r.live_rows) : null;
      forensics.deadRows = r.dead_rows ? Number(r.dead_rows) : null;
      log(`[audit] security_events est_rows: ${forensics.estimatedRows?.toLocaleString() ?? "n/a"}  live: ${forensics.liveRows?.toLocaleString() ?? "n/a"}  dead: ${forensics.deadRows?.toLocaleString() ?? "n/a"}`);
    }
  } catch (err) {
    log(`[audit] security_events row estimates failed: ${err.message}`);
  }

  // 3. event_type counts
  try {
    const typeQ = await client.query(`
      SELECT event_type, COUNT(*)::bigint AS cnt
      FROM security_events
      GROUP BY event_type
      ORDER BY cnt DESC
    `);
    for (const row of typeQ.rows) {
      forensics.eventTypeCounts[row.event_type] = Number(row.cnt);
    }
    log(`[audit] security_events event_type breakdown:`);
    for (const [type, cnt] of Object.entries(forensics.eventTypeCounts)) {
      log(`  ${type.padEnd(30)} ${cnt.toLocaleString()} rows`);
    }
  } catch (err) {
    log(`[audit] security_events event_type counts failed: ${err.message}`);
  }

  // 4. Oldest/newest timestamps per dominant event types
  try {
    const types = Object.keys(forensics.eventTypeCounts).slice(0, 10);
    for (const type of types) {
      const tsQ = await client.query(`
        SELECT
          MIN(created_at) AS oldest,
          MAX(created_at) AS newest
        FROM security_events
        WHERE event_type = $1
      `, [type]);
      if (tsQ.rows.length > 0 && tsQ.rows[0].oldest) {
        forensics.oldestNewestPerType[type] = {
          oldest: tsQ.rows[0].oldest,
          newest: tsQ.rows[0].newest,
        };
        log(`[audit]   ${type}: oldest=${tsQ.rows[0].oldest}  newest=${tsQ.rows[0].newest}`);
      }
    }
  } catch (err) {
    log(`[audit] security_events timestamp range failed: ${err.message}`);
  }

  // 5. Check if trg_suppress_api_request_security_events exists and is enabled
  try {
    const trigQ = await client.query(`
      SELECT tgname, tgenabled
      FROM pg_trigger
      WHERE tgname = 'trg_suppress_api_request_security_events'
        AND tgrelid = 'security_events'::regclass
    `);
    if (trigQ.rows.length > 0) {
      forensics.triggerExists = true;
      // tgenabled: 'O' = origin (enabled), 'D' = disabled, 'R' = replica, 'A' = always
      forensics.triggerEnabled = trigQ.rows[0].tgenabled === 'O';
      log(`[audit] trigger trg_suppress_api_request_security_events: exists=true  enabled=${forensics.triggerEnabled}`);
    } else {
      log(`[audit] trigger trg_suppress_api_request_security_events: NOT FOUND`);
    }
  } catch (err) {
    log(`[audit] trigger check failed: ${err.message}`);
  }

  // 6. Check if migration 9999 appears recorded
  try {
    const migQ = await client.query(`
      SELECT 1 AS exists
      FROM applied_sql_migrations
      WHERE filename = '9999_disable_api_request_security_events.sql'
    `);
    forensics.migration9999Recorded = migQ.rows.length > 0;
    log(`[audit] migration 9999_disable_api_request_security_events.sql: ${forensics.migration9999Recorded ? "RECORDED" : "NOT RECORDED"}`);
  } catch (err) {
    log(`[audit] migration ledger check failed: ${err.message}`);
  }

  // 7. Bloat analysis
  if (forensics.heapSize && forensics.liveRows && forensics.estimatedRows) {
    const avgTupleSize = forensics.heapSize / forensics.liveRows;
    const expectedHeapSize = forensics.liveRows * avgTupleSize;
    const bloatBytes = forensics.heapSize - expectedHeapSize;
    const bloatPercent = forensics.heapSize > 0 ? ((bloatBytes / forensics.heapSize) * 100).toFixed(1) : "0.0";

    forensics.bloatAnalysis = {
      avgTupleSizeBytes: Math.round(avgTupleSize),
      expectedHeapSizeBytes: Math.round(expectedHeapSize),
      bloatBytes: Math.round(bloatBytes),
      bloatPercent: `${bloatPercent}%`,
      deadTupleRatio: forensics.liveRows > 0 ? ((forensics.deadRows / forensics.liveRows) * 100).toFixed(1) + "%" : "0.0%",
    };

    log(`[audit] security_events bloat analysis:`);
    log(`  avg_tuple_size: ${forensics.bloatAnalysis.avgTupleSizeBytes} bytes`);
    log(`  expected_heap: ${formatBytes(forensics.bloatAnalysis.expectedHeapSizeBytes)}`);
    log(`  actual_heap:   ${formatBytes(forensics.heapSize)}`);
    log(`  bloat:         ${formatBytes(forensics.bloatAnalysis.bloatBytes)} (${forensics.bloatAnalysis.bloatPercent})`);
    log(`  dead_tuple_ratio: ${forensics.bloatAnalysis.deadTupleRatio}`);
  }

  // 8. Distinguish live-row bloat from dead-tuple/physical bloat
  if (forensics.deadRows && forensics.liveRows) {
    const deadRatio = forensics.deadRows / forensics.liveRows;
    if (deadRatio > 0.2) {
      log(`[audit] WARNING: High dead-tuple ratio (${(deadRatio * 100).toFixed(1)}%) — VACUUM or VACUUM FULL may reclaim space.`);
    } else if (forensics.bloatAnalysis.bloatPercent && parseFloat(forensics.bloatAnalysis.bloatPercent) > 20) {
      log(`[audit] WARNING: Heap bloat ${forensics.bloatAnalysis.bloatPercent} with low dead-tuple ratio — likely live-row bloat (many api_request rows).`);
    } else {
      log(`[audit] Bloat appears minimal or consistent with normal operation.`);
    }
  }

  return forensics;
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
  console.error("[audit] fatal:", err);
  process.exit(1);
});