/**
 * Pre-migration database-capacity gate.
 *
 * Compares the actual database size against an EXPLICIT operator-defined
 * budget (AXTASK_DB_SIZE_BUDGET_BYTES). If no operator budget is configured,
 * the gate reports the database size and any provider capacity hint but does
 * NOT invent a default ceiling or produce a HARD_FAIL from a guessed number.
 *
 * Usage:
 *   node scripts/deploy/check-db-capacity.mjs
 *
 * Environment:
 *   DATABASE_URL                   - Postgres connection string (required)
 *   AXTASK_DB_SIZE_BUDGET_BYTES    - Operator budget in bytes (optional).
 *                                    When set, enables threshold classification.
 *                                    When unset, gate is REPORT-ONLY.
 *                                    When present but malformed/empty, the gate
 *                                    fails closed with exit 3 instead of silently
 *                                    disabling the operator limit.
 *   AXTASK_DB_CAPACITY_ACK         - "1" to acknowledge a soft-fail warning
 *                                    and let a deploy proceed. Only relevant
 *                                    when an explicit budget exists.
 *   AXTASK_DB_CAPACITY_JSON        - "1" to also emit JSON report on stdout.
 *
 * Exit codes:
 *   0 - OK (no budget configured, or well below budget, or soft-fail acknowledged)
 *   1 - Soft fail (>=85% of explicit operator budget): blocks unless acknowledged
 *   2 - Hard fail (>=90% of explicit operator budget): never proceeds
 *   3 - Fatal error (connection, malformed explicit budget, etc.)
 *
 * Provider metadata such as neon.max_cluster_size is informational only. It is
 * never used as the operator budget or billing-plan allowance.
 */

import pgModule from "pg";
import { pathToFileURL } from "node:url";
const pg = pgModule.default || pgModule;

function formatBytes(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n < 1024) return `${n} bytes`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  const mb = kb / 1024;
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
  try {
    const { rows } = await client.query("SHOW neon.max_cluster_size");
    return rows[0] ? Object.values(rows[0])[0] : null;
  } catch {
    return null;
  }
}

function normalizeBudget(raw, source) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new Error(`${source} is explicitly configured but empty; unset it for report-only mode or provide a positive byte count`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${source} must be a positive finite byte count; received ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseBudget() {
  const key = "AXTASK_DB_SIZE_BUDGET_BYTES";
  if (!Object.prototype.hasOwnProperty.call(process.env, key)) return null;
  return normalizeBudget(process.env[key], key);
}

function printReport(report) {
  const {
    dbSize,
    operatorBudget,
    operatorBudgetSource,
    providerHint,
    fraction,
    level,
    topTables,
  } = report;

  console.log(`[db-capacity] Level: ${level.toUpperCase()}`);
  console.log(`[db-capacity] Database size: ${formatBytes(dbSize)}`);

  if (operatorBudget !== null) {
    console.log(
      `[db-capacity] Operator budget: ${formatBytes(operatorBudget)} (source: ${operatorBudgetSource})`,
    );
    console.log(
      `[db-capacity] Utilization: ${(fraction * 100).toFixed(1)}% of operator budget`,
    );
  } else {
    console.log("[db-capacity] Operator budget: NOT CONFIGURED (report-only mode)");
    console.log("[db-capacity] No threshold evaluation performed.");
  }

  if (providerHint) {
    console.log(
      `[db-capacity] Provider capacity hint (neon.max_cluster_size): ${providerHint}`,
    );
    if (operatorBudget !== null) {
      const hintBytes = parseProviderHint(providerHint);
      if (hintBytes && operatorBudget > hintBytes) {
        console.warn(
          `[db-capacity] WARNING: Operator budget (${formatBytes(operatorBudget)}) exceeds provider hint (${providerHint}).`,
        );
      }
    }
  } else {
    console.log("[db-capacity] Provider capacity hint: NOT AVAILABLE");
  }

  if (topTables.length > 0) {
    console.log("[db-capacity] Top tables by size:");
    for (const t of topTables) {
      console.log(`  ${t.schema}.${t.table}  ${formatBytes(t.bytes)}`);
    }
  }
}

function parseProviderHint(hint) {
  const match = String(hint).trim().match(/^([\d.]+)\s*(\w+)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5,
  };
  const mult = multipliers[unit];
  if (!Number.isFinite(value) || !mult) return null;
  return value * mult;
}

function buildReport(
  dbSize,
  operatorBudget,
  operatorBudgetSource,
  providerHint,
  topTables,
) {
  let fraction = 0;
  let level = "ok";
  let exitCode = 0;
  let verdict = "no_operator_budget";
  let reason = "No explicit operator budget configured; gate is report-only.";

  if (operatorBudget !== null) {
    fraction = dbSize / operatorBudget;
    const classification = classify(fraction);
    level = classification.level;
    exitCode = classification.exitCode;
    if (level === "hard_fail") {
      verdict = "hard_fail";
      reason = "Database size >= 90% of explicit operator budget.";
    } else if (level === "soft_fail") {
      verdict = "soft_fail";
      reason = "Database size >= 85% of explicit operator budget.";
    } else if (level === "warn") {
      verdict = "warn";
      reason = "Database size >= 75% of explicit operator budget.";
    } else {
      verdict = "ok";
      reason = "Database size well below explicit operator budget.";
    }
  }

  return {
    ok: exitCode === 0,
    level,
    exitCode,
    verdict,
    reason,
    dbSize,
    operatorBudget,
    operatorBudgetSource,
    providerHint,
    fraction: operatorBudget !== null ? fraction : null,
    utilizationPercent:
      operatorBudget !== null ? (fraction * 100).toFixed(1) : null,
    topTables,
  };
}

export async function runCapacityCheck({ url, budget } = {}) {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const hasArgumentBudget = budget !== undefined;
  const operatorBudget = hasArgumentBudget
    ? normalizeBudget(budget, "budget argument")
    : parseBudget();
  const operatorBudgetSource = hasArgumentBudget
    ? "argument"
    : operatorBudget !== null
      ? "env:AXTASK_DB_SIZE_BUDGET_BYTES"
      : "unset";

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const dbSize = await fetchDbSize(client);
    const [topTables, providerHint] = await Promise.all([
      fetchTopTables(client),
      fetchNeonClusterHint(client),
    ]);
    return buildReport(
      dbSize,
      operatorBudget,
      operatorBudgetSource,
      providerHint,
      topTables,
    );
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
        `[db-capacity] HARD FAIL: ${report.reason} Reduce DB size or deliberately revise AXTASK_DB_SIZE_BUDGET_BYTES only after documenting the new operator limit.`,
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
        `[db-capacity] SOFT FAIL: ${report.reason} Set AXTASK_DB_CAPACITY_ACK=1 only after operator review to acknowledge and proceed.`,
      );
      process.exit(1);
    }
    if (report.level === "warn") {
      console.warn(`[db-capacity] WARN: ${report.reason} Proceeding.`);
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
