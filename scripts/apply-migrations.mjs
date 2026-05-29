#!/usr/bin/env node
/**
 * Non-interactive SQL migration runner for production deployments.
 * Reads migrations/*.sql in lexicographic order, tracks applied files in
 * an `applied_sql_migrations` table, and skips already-applied files.
 *
 * Migration airlock runs only when pending migrations exist so no-op
 * restarts are not blocked by stale backup ledger state.
 *
 * Exits 0 on success, 1 on any failure.
 *
 * Usage:  node scripts/apply-migrations.mjs
 * Env:    DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");

function listPendingMigrationFiles(appliedSet) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !appliedSet.has(f));
}

async function runMigrationAirlockIfNeeded() {
  const explicitSkipAirlock = process.argv.includes("--skip-airlock") || process.env.MIGRATION_SKIP_AIRLOCK === "true";
  const ciBypassAirlock = process.env.CI === "true" || process.env.NODE_ENV === "test";
  const skipAirlock = explicitSkipAirlock || ciBypassAirlock;
  if (skipAirlock) {
    const bypassReason = explicitSkipAirlock ? "explicit skip" : "CI/test bootstrap";
    console.warn(`[migrate] WARNING: migration airlock bypassed (${bypassReason}).`);
    return;
  }

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
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "applied_sql_migrations" (
        "filename" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows: applied } = await client.query(
      `SELECT filename FROM applied_sql_migrations`
    );
    const appliedSet = new Set(applied.map((r) => r.filename));
    const pending = listPendingMigrationFiles(appliedSet);

    if (pending.length === 0) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      console.log(`[migrate] no pending migrations (${files.length} already applied or none on disk).`);
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s); running airlock…`);
    await runMigrationAirlockIfNeeded();

    let appliedCount = 0;
    for (const file of pending) {
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

    console.log(`[migrate] done. ${appliedCount} applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
