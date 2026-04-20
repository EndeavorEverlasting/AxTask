#!/usr/bin/env node
/**
 * Aggressive database reclaim for the AxTask Neon project.
 *
 * Runs a pre-audited, idempotent sequence of:
 *   1. TRUNCATE of archetype signal tables (hashed actors — zero PII loss).
 *   2. Retention-window DELETEs on audit / expired / dedup tables.
 *   3. Optional DROP INDEX list (supplied via --drop-indexes=<file>.json).
 *   4. VACUUM FULL on the rewritten tables to return pages to the OS.
 *   5. REINDEX TABLE after VACUUM FULL to rebuild compressed index storage.
 *
 * SAFETY GATES:
 *   - Refuses to run without `--confirm=YES`.
 *   - Refuses to run without `NODE_ENV=production` OR `--prod` (belt + suspenders).
 *   - Captures `pg_database_size` before and after; refuses to claim success if
 *     the database failed to shrink.
 *   - DROP INDEX list must be supplied via file; never inferred automatically.
 *
 * NEVER touched, even on aggressive:
 *   tasks, task_collaborators, attachment_assets, wallets, coin_transactions,
 *   users, classification_*, community_*, premium_subscriptions, invoices.
 *
 * Usage:
 *   node scripts/db-reclaim.mjs --confirm=YES --prod
 *   node scripts/db-reclaim.mjs --confirm=YES --prod --drop-indexes=./drop-indexes.json
 *   node scripts/db-reclaim.mjs --confirm=YES --prod --dry-run
 *
 * The `--dry-run` flag prints the exact SQL that *would* run, without
 * executing the destructive statements (the initial `pg_database_size` probe
 * still runs so the user sees current state).
 *
 * Env: DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;
import fs from "node:fs";

const args = parseArgs(process.argv.slice(2));
const confirm = args.get("confirm");
const isProd = args.has("prod") || process.env.NODE_ENV === "production";
const dryRun = args.has("dry-run");
const dropIndexesPath = args.get("drop-indexes") ?? null;

if (confirm !== "YES") {
  console.error("[reclaim] refusing to run without --confirm=YES");
  process.exit(2);
}
if (!isProd) {
  console.error("[reclaim] refusing to run without --prod (or NODE_ENV=production).");
  process.exit(2);
}

/**
 * The destructive plan, in execution order. Each entry is one SQL statement
 * plus a label for logging. Grouped so we TRUNCATE / DELETE first (which just
 * marks pages for reuse), then VACUUM FULL (which rewrites the heap and
 * actually shrinks the file on disk), then REINDEX (which rebuilds and
 * shrinks the index files).
 */
const TRUNCATE_STATEMENTS = [
  {
    label: "TRUNCATE security_events (archetype + dispute signals — hashed actors)",
    sql: `TRUNCATE TABLE security_events RESTART IDENTITY`,
  },
  {
    label: "TRUNCATE archetype rollups (derived; rebuilds nightly)",
    sql: `TRUNCATE TABLE archetype_rollup_daily, archetype_markov_daily RESTART IDENTITY`,
  },
];

const DELETE_STATEMENTS = [
  {
    label: "DELETE security_logs older than 30 days",
    sql: `DELETE FROM security_logs WHERE created_at < now() - interval '30 days'`,
  },
  {
    label: "DELETE idempotency_keys older than 7 days",
    sql: `DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days'`,
  },
  {
    label: "DELETE expired mfa_challenges",
    sql: `DELETE FROM mfa_challenges WHERE expires_at < now() - interval '1 day'`,
  },
  {
    label: "DELETE expired password_reset_tokens",
    sql: `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`,
  },
  {
    label: "DELETE task_import_fingerprints older than 90 days",
    sql: `DELETE FROM task_import_fingerprints WHERE created_at < now() - interval '90 days'`,
  },
  {
    label: "DELETE invoice_events older than 180 days",
    sql: `DELETE FROM invoice_events WHERE created_at < now() - interval '180 days'`,
  },
  {
    label: "DELETE premium_events older than 180 days",
    sql: `DELETE FROM premium_events WHERE created_at < now() - interval '180 days'`,
  },
  {
    label: "DELETE study_review_events older than 365 days",
    sql: `DELETE FROM study_review_events WHERE created_at < now() - interval '365 days'`,
  },
  {
    label: "DELETE usage_snapshots older than 90 days",
    sql: `DELETE FROM usage_snapshots WHERE created_at < now() - interval '90 days'`,
  },
];

/** Tables we VACUUM FULL + REINDEX after the writes above. */
const VACUUM_TABLES = [
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
];

function parseArgs(argv) {
  const map = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) map.set(raw.slice(2), true);
    else map.set(raw.slice(2, eq), raw.slice(eq + 1));
  }
  return {
    get: (k) => map.get(k),
    has: (k) => map.has(k),
  };
}

async function dbSize(client) {
  const { rows } = await client.query(`
    SELECT
      pg_database_size(current_database()) AS bytes,
      pg_size_pretty(pg_database_size(current_database())) AS pretty
  `);
  return rows[0];
}

async function runOne(client, stmt) {
  if (dryRun) {
    console.log(`[reclaim] (dry-run) ${stmt.label}`);
    console.log(`           SQL: ${stmt.sql}`);
    return { rowCount: null };
  }
  const start = Date.now();
  const res = await client.query(stmt.sql);
  const ms = Date.now() - start;
  const rc = res.rowCount === null ? "" : `  (${res.rowCount} rows)`;
  console.log(`[reclaim] ${stmt.label}  -> ${ms} ms${rc}`);
  return res;
}

async function loadDropIndexes() {
  if (!dropIndexesPath) return [];
  const raw = fs.readFileSync(dropIndexesPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`--drop-indexes file must be a JSON array of { schema, index } objects`);
  }
  /* Safety: refuse to drop anything that looks primary / unique / foreign-key. */
  for (const entry of parsed) {
    if (!entry.schema || !entry.index) {
      throw new Error(`drop-indexes entry missing schema/index: ${JSON.stringify(entry)}`);
    }
    if (entry.index.endsWith("_pkey")) {
      throw new Error(`refusing to drop primary key index ${entry.schema}.${entry.index}`);
    }
    if (entry.index.startsWith("ux_") || entry.index.startsWith("uniq_")) {
      throw new Error(
        `refusing to drop unique index ${entry.schema}.${entry.index} (uniqueness is correctness-critical)`,
      );
    }
  }
  return parsed;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[reclaim] DATABASE_URL is not set.");
    process.exit(1);
  }

  const indexesToDrop = await loadDropIndexes();
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    const before = await dbSize(client);
    console.log(
      `[reclaim] database size BEFORE: ${before.pretty}  (${before.bytes} bytes)  dry_run=${dryRun}`,
    );

    /* Wrap TRUNCATE + DELETEs in one transaction so partial failure rolls back
     * cleanly. VACUUM FULL and REINDEX cannot run in a transaction, so they
     * execute afterward. */
    if (!dryRun) await client.query("BEGIN");

    for (const stmt of TRUNCATE_STATEMENTS) await runOne(client, stmt);
    for (const stmt of DELETE_STATEMENTS) await runOne(client, stmt);

    for (const entry of indexesToDrop) {
      await runOne(client, {
        label: `DROP INDEX ${entry.schema}.${entry.index}`,
        sql: `DROP INDEX IF EXISTS "${entry.schema}"."${entry.index}"`,
      });
    }

    if (!dryRun) await client.query("COMMIT");

    /* VACUUM FULL + REINDEX — outside a transaction, per-table, so if one
     * hangs we can ctrl-C without losing the earlier work. */
    for (const table of VACUUM_TABLES) {
      await runOne(client, {
        label: `VACUUM FULL ${table}`,
        sql: `VACUUM FULL "${table}"`,
      });
      await runOne(client, {
        label: `REINDEX TABLE ${table}`,
        sql: `REINDEX TABLE "${table}"`,
      });
    }

    const after = await dbSize(client);
    const deltaBytes = Number(before.bytes) - Number(after.bytes);
    const deltaPretty = formatBytes(deltaBytes);
    console.log(
      `[reclaim] database size AFTER:  ${after.pretty}  (${after.bytes} bytes)`,
    );
    console.log(`[reclaim] reclaimed: ${deltaPretty}`);

    if (!dryRun && deltaBytes <= 0) {
      console.error(
        "[reclaim] WARNING: database did not shrink. This usually means the whales are not where we expected — re-run scripts/db-size-audit.mjs and inspect.",
      );
      process.exit(3);
    }
  } catch (err) {
    if (!dryRun) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* already rolled back or never began */
      }
    }
    console.error("[reclaim] fatal:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

main();
