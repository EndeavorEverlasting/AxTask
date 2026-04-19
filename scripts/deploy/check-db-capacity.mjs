/**
 * Pre-migration database-capacity gate.
 *
 * Installed in response to a production deploy that crashed inside
 * scripts/apply-migrations.mjs when Neon's project storage limit (512 MB)
 * was exceeded (Postgres ERROR 53100 project size limit, Neon hint
 * `neon.max_cluster_size`). That failure was undetectable until migrations
 * were already attempting to write; this gate runs BEFORE migrations and
 * blocks the deploy if the DB is too close to the plan ceiling.
 *
 * Usage:
 *   node scripts/deploy/check-db-capacity.mjs
 *
 * Environment:
 *   DATABASE_URL                   - Postgres connection string (required)
 *   AXTASK_DB_SIZE_BUDGET_BYTES    - Plan ceiling (default 536870912 = 512 MB)
 *   AXTASK_DB_CAPACITY_ACK         - "1" to acknowledge a soft-fail warning
 *                                    and let a deploy proceed (CI operator opt-in)
 *   AXTASK_DB_CAPACITY_JSON        - "1" to also emit JSON report on stdout
 *
 * Exit codes:
 *   0 - OK (well below ceiling, or soft-fail acknowledged)
 *   1 - Soft fail (>=85% of budget): blocks CI unless AXTASK_DB_CAPACITY_ACK=1
 *   2 - Hard fail (>=90% of budget): never proceeds; drops tables or upgrades plan
 *
 * Non-Neon environments: gracefully skips Neon-specific queries.
 */
import pgModule from "pg";
import { pathToFileURL } from "node:url";
const pg = pgModule.default || pgModule;

const DEFAULT_BUDGET = 536_870_912; // 512 MB

function parseBudget() {
  const raw = process.env.AXTASK_DB_SIZE_BUDGET_BYTES;
  if (!raw) return DEFAULT_BUDGET;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(
      `[db-capacity] Invalid AXTASK_DB_SIZE_BUDGET_BYTES=${JSON.stringify(raw)}; using default ${DEFAULT_BUDGET}.`,
    );
    return DEFAULT_BUDGET;
  }
  return n;
}

function formatBytes(n) {
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function classify(fraction) {
  if (fraction >= 0.9) return { level: "hard_fail", exitCode: 2 };
  if (fraction >= 0.85) return { level: "soft_fail", exitCode: 1 };
  if (fraction >= 0.75) return { level: "warn", exitCode: 0 };
  return { level: "ok", exitCode: 0 };
}

async function fetchDbSize(client) {
  const { rows } = await client.query(
    "SELECT pg_database_size(current_database())::bigint AS db_size_bytes",
  );
  return Number(rows[0].db_size_bytes);
}

async function fetchTopTables(client, limit = 10) {
  // Tolerate missing views (older PG, locked-down roles): swallow errors here.
  try {
    const { rows } = await client.query(
      `SELECT schemaname, relname AS table_name,
              pg_total_relation_size(schemaname || '.' || relname)::bigint AS total_bytes
         FROM pg_stat_user_tables
         ORDER BY total_bytes DESC
         LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      schema: r.schemaname,
      table: r.table_name,
      bytes: Number(r.total_bytes),
    }));
  } catch {
    return [];
  }
}

async function fetchNeonClusterHint(client) {
  // Neon-only. Swallow errors if the view doesn't exist.
  try {
    const { rows } = await client.query("SHOW neon.max_cluster_size");
    return rows[0] ? Object.values(rows[0])[0] : null;
  } catch {
    return null;
  }
}

function printReport(report) {
  const { dbSize, budget, fraction, level, topTables, neonHint } = report;
  console.log(`[db-capacity] Level: ${level.toUpperCase()}`);
  console.log(
    `[db-capacity] Size: ${formatBytes(dbSize)} / budget ${formatBytes(budget)} (${(fraction * 100).toFixed(1)}%)`,
  );
  if (neonHint) console.log(`[db-capacity] Neon max_cluster_size: ${neonHint}`);
  if (topTables.length > 0) {
    console.log("[db-capacity] Top tables by size:");
    for (const t of topTables) {
      console.log(`  ${t.schema}.${t.table}  ${formatBytes(t.bytes)}`);
    }
  }
}

export async function runCapacityCheck({ url, budget } = {}) {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const actualBudget = budget ?? parseBudget();
  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const dbSize = await fetchDbSize(client);
    const [topTables, neonHint] = await Promise.all([
      fetchTopTables(client),
      fetchNeonClusterHint(client),
    ]);
    const fraction = dbSize / actualBudget;
    const { level, exitCode } = classify(fraction);
    return {
      ok: exitCode === 0,
      level,
      exitCode,
      dbSize,
      budget: actualBudget,
      fraction,
      topTables,
      neonHint,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  try {
    const report = await runCapacityCheck();
    printReport(report);
    if (process.env.AXTASK_DB_CAPACITY_JSON === "1") {
      console.log(JSON.stringify(report, null, 2));
    }
    if (report.level === "hard_fail") {
      console.error(
        "[db-capacity] HARD FAIL: DB is >= 90% of budget. Deploy blocked. Reduce DB size or raise AXTASK_DB_SIZE_BUDGET_BYTES.",
      );
      process.exit(2);
    }
    if (report.level === "soft_fail") {
      if (process.env.AXTASK_DB_CAPACITY_ACK === "1") {
        console.warn(
          "[db-capacity] SOFT FAIL acknowledged (AXTASK_DB_CAPACITY_ACK=1). Proceeding.",
        );
        process.exit(0);
      }
      console.error(
        "[db-capacity] SOFT FAIL: DB is >= 85% of budget. Set AXTASK_DB_CAPACITY_ACK=1 to acknowledge and proceed.",
      );
      process.exit(1);
    }
    if (report.level === "warn") {
      console.warn(
        "[db-capacity] WARN: DB is >= 75% of budget. Proceeding but consider cleanup.",
      );
    }
    process.exit(0);
  } catch (err) {
    console.error(`[db-capacity] fatal: ${err instanceof Error ? err.message : err}`);
    process.exit(3);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
