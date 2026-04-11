#!/usr/bin/env node
/**
 * Non-interactive SQL migration runner for production deployments.
 * Reads migrations/*.sql in lexicographic order, tracks applied files in
 * an `applied_sql_migrations` table, and skips already-applied files.
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
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

