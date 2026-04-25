#!/usr/bin/env node
/**
 * Read-only Neon / Postgres size audit.
 *
 * Prints — in both human-readable text and JSON at the tail — the data we need
 * to decide what to reclaim in `scripts/db-reclaim.mjs`:
 *
 *   - Total database size.
 *   - Top 20 tables by total size (heap + indexes + toast).
 *   - Top 20 indexes by size.
 *   - Never-used indexes (idx_scan = 0, excluding primary keys).
 *   - Row counts for known append-only "whale" tables.
 *
 * Safe to run against production; every statement is a SELECT.
 *
 * Usage:  node scripts/db-size-audit.mjs [--json]
 * Env:    DATABASE_URL (required)
 *
 * The `--json` flag suppresses the human-readable preamble and prints ONLY the
 * JSON document to stdout, which `db-reclaim.mjs` can consume.
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;

const jsonOnly = process.argv.includes("--json");

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
  } finally {
    client.release();
    await pool.end();
  }

  process.stdout.write(JSON.stringify(report, bigIntReplacer, 2));
  if (!jsonOnly) process.stdout.write("\n");
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
