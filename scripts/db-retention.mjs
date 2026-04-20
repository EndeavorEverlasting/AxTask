#!/usr/bin/env node
/**
 * Nightly retention job. Safe, idempotent, conservative subset of
 * `scripts/db-reclaim.mjs`:
 *
 *   - DELETEs rows older than the documented retention windows only.
 *   - No TRUNCATE, no DROP INDEX, no VACUUM FULL (those are reserved for
 *     the one-shot reclaim script that runs during a maintenance window).
 *   - Runs each DELETE in its own short transaction so a slow table can be
 *     interrupted without rolling back the others.
 *
 * Designed for unattended execution (cron, Render scheduled job).
 * Exits 0 on success, 1 on any failure.
 *
 * See [docs/DB_RETENTION_POLICY.md](docs/DB_RETENTION_POLICY.md) for the
 * canonical windows; this script and that doc must stay in lockstep.
 *
 * Usage:  node scripts/db-retention.mjs
 * Env:    DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;

/**
 * Retention windows. Keep this list in lockstep with
 * docs/DB_RETENTION_POLICY.md. Values are Postgres `interval` strings.
 */
const RETENTION_WINDOWS = [
  { table: "security_logs",             column: "created_at", window: "90 days"  },
  { table: "security_events",           column: "created_at", window: "90 days"  },
  { table: "idempotency_keys",          column: "created_at", window: "7 days"   },
  { table: "mfa_challenges",            column: "expires_at", window: "1 day"    },
  { table: "password_reset_tokens",     column: "expires_at", window: "1 day"    },
  { table: "task_import_fingerprints",  column: "created_at", window: "90 days"  },
  { table: "invoice_events",            column: "created_at", window: "365 days" },
  { table: "premium_events",            column: "created_at", window: "365 days" },
  { table: "study_review_events",       column: "created_at", window: "730 days" },
  { table: "usage_snapshots",           column: "created_at", window: "180 days" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[retention] DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  let totalRows = 0;
  let failed = 0;

  try {
    for (const { table, column, window } of RETENTION_WINDOWS) {
      const sql = `DELETE FROM "${table}" WHERE "${column}" < now() - interval '${window}'`;
      try {
        const start = Date.now();
        await client.query("BEGIN");
        const res = await client.query(sql);
        await client.query("COMMIT");
        const ms = Date.now() - start;
        totalRows += res.rowCount ?? 0;
        console.log(
          `[retention] ${table}.${column} < now() - ${window}  -> ${res.rowCount ?? 0} rows in ${ms} ms`,
        );
      } catch (err) {
        failed++;
        try {
          await client.query("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        console.error(`[retention] ${table}: ${err.message}`);
      }
    }
    console.log(`[retention] done. rows_deleted=${totalRows} failed_tables=${failed}`);
    if (failed > 0) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[retention] fatal:", err);
  process.exit(1);
});
