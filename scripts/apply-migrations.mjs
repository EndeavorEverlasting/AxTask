#!/usr/bin/env node
/**
 * Non-interactive SQL migration runner for production deployments.
 * Reads migrations/*.sql in lexicographic order, tracks applied files in
 * an `applied_sql_migrations` table, and skips already-applied files.
 *
 * Normal production startup passes --production-startup. In that mode a
 * pending recovery-only migration on a non-loopback database is a hard stop:
 * recovery mutations must be executed deliberately under the recovery runbook,
 * never as a side effect of starting Render/Docker.
 *
 * Exits 0 on success, 1 on any failure.
 *
 * Usage:  node scripts/apply-migrations.mjs [--production-startup]
 * Env:    DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoDatabaseTargetOverrides,
  isLoopbackDatabaseUrl,
} from "./db/pg-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");
const RECOVERY_ONLY_MIGRATIONS = new Set([
  "9999_disable_api_request_security_events.sql",
]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const productionStartup = process.argv.includes("--production-startup");
  let loopbackTarget = false;
  try {
    // PostgreSQL URI query parameters can override host/port/dbname. Reuse the
    // recovery tooling's canonical target-identity rule so a URL that looks
    // loopback cannot secretly route to a remote production database.
    assertNoDatabaseTargetOverrides(url);
    loopbackTarget = isLoopbackDatabaseUrl(url);
  } catch (error) {
    console.error(
      `[migrate] DATABASE_URL target is invalid or ambiguous: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // Migration airlock: refuse to run DDL without a recent verified backup.
  // CI/test bootstrap databases are disposable, so allow them to bypass the
  // airlock without requiring a fake backup ledger entry.
  const explicitSkipAirlock = process.argv.includes("--skip-airlock") || process.env.MIGRATION_SKIP_AIRLOCK === "true";
  const ciBypassAirlock = process.env.CI === "true" || process.env.NODE_ENV === "test";
  const skipAirlock = explicitSkipAirlock || ciBypassAirlock;
  if (!skipAirlock) {
    const airlockPath = path.resolve(__dirname, "migration-airlock.mjs");
    const { spawnSync } = await import("node:child_process");
    const airlockResult = spawnSync(process.execPath, [airlockPath], {
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
      cwd: path.resolve(__dirname, ".."),
    });
    if (airlockResult.status !== 0) {
      console.error("[migrate] Migration airlock failed. Refusing to run migrations.");
      console.error("[migrate] Pass --skip-airlock to bypass (emergency use only).");
      process.exit(1);
    }
  } else {
    const bypassReason = explicitSkipAirlock ? "explicit skip" : "CI/test bootstrap";
    console.warn(`[migrate] WARNING: migration airlock bypassed (${bypassReason}).`);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "applied_sql_migrations" (
        "filename" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Read already-applied set
    const { rows: applied } = await client.query(
      `SELECT filename FROM applied_sql_migrations`
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Gather migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pendingRecoveryOnly = files.filter(
      (file) => RECOVERY_ONLY_MIGRATIONS.has(file) && !appliedSet.has(file),
    );

    // A production process restart/deploy is never authorization to perform
    // incident recovery. Refuse before applying *any* pending migration so a
    // schema migration cannot partially advance and then strand the process at
    // the recovery boundary. Disposable loopback certification remains able to
    // replay the complete migration set.
    if (productionStartup && !loopbackTarget && pendingRecoveryOnly.length > 0) {
      console.error(
        `[migrate] RECOVERY_ONLY_MIGRATION_PENDING: ${pendingRecoveryOnly.join(", ")}`,
      );
      console.error(
        "[migrate] Normal production startup will not execute recovery-only SQL.",
      );
      console.error(
        "[migrate] Follow docs/DB_RECOVERY_RUNBOOK.md. After the recovery prerequisites are satisfied, apply the pending migration deliberately outside app startup under the migration airlock, then deploy.",
      );
      process.exitCode = 1;
      return;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`[migrate] applying: ${file} …`);

      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO applied_sql_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
          [file]
        );
        appliedCount++;
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        console.error(`[migrate] ✗ ${file} — ${err.message}`);
        throw err;
      }
    }

    console.log(
      `[migrate] done. ${appliedCount} applied, ${files.length - appliedCount} skipped.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
