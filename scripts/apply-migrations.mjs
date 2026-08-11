#!/usr/bin/env node
/**
 * Non-interactive SQL migration runner for production deployments.
 * Reads migrations/*.sql in lexicographic order, tracks applied files in
 * an `applied_sql_migrations` table, and skips already-applied files.
 *
 * Migration concurrency is serialized with a session advisory lock. Database
 * lock waits, statements, idle transactions, pool connection attempts, and
 * migration-runner coordination all have bounded timeouts configurable by env.
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
import {
  acquireMigrationCoordinator,
  configureMigrationSession,
  migrationSafetyConfig,
  releaseMigrationCoordinator,
} from "./migration-safety.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const safety = migrationSafetyConfig();

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

  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: safety.connectionTimeoutMs,
  });
  let client;
  let coordinatorAcquired = false;

  try {
    client = await pool.connect();
    await configureMigrationSession(client, safety);
    console.log(
      `[migrate] safety lock=${safety.lockTimeoutMs}ms statement=${safety.statementTimeoutMs}ms ` +
      `idle-tx=${safety.idleInTransactionTimeoutMs}ms connect=${safety.connectionTimeoutMs}ms ` +
      `coordination=${safety.coordinationTimeoutMs}ms`,
    );

    const coordination = await acquireMigrationCoordinator(client, safety);
    coordinatorAcquired = true;
    console.log(
      `[migrate] coordinator acquired attempts=${coordination.attempts} waited=${coordination.waitedMs}ms`,
    );

    // Ensure tracking table exists only after this process owns the migration coordinator.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "applied_sql_migrations" (
        "filename" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Read already-applied set while still holding the coordinator so no second
    // runner can race the file decision and metadata write.
    const { rows: applied } = await client.query(
      `SELECT filename FROM applied_sql_migrations`
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Gather migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`[migrate] applying: ${file} …`);

      try {
        // Do not wrap migration files here: some existing migrations own their
        // transaction boundary explicitly. Session-level timeouts still apply.
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
    if (client && coordinatorAcquired) {
      try {
        await releaseMigrationCoordinator(client);
        console.log("[migrate] coordinator released");
      } catch (err) {
        // Closing the session below also releases session advisory locks.
        console.error(`[migrate] coordinator release warning: ${err.message}`);
      }
    }
    if (client) client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
