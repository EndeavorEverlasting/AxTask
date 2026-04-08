#!/usr/bin/env node
/**
 * Apply numbered SQL files in migrations/ once per database, before drizzle-kit push.
 * Journal: applied_sql_migrations (created here if missing; also declared in shared/schema.ts).
 *
 * Env:
 *   DATABASE_URL — required
 *   SKIP_SQL_MIGRATIONS=true|1 — no-op success (drizzle push can still run)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(projectRoot, "migrations");

const JOURNAL_DDL = `
CREATE TABLE IF NOT EXISTS applied_sql_migrations (
  filename text PRIMARY KEY,
  applied_at timestamp DEFAULT now() NOT NULL
);
`;

function skipRequested() {
  const v = String(process.env.SKIP_SQL_MIGRATIONS ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

async function main() {
  if (skipRequested()) {
    console.log("[migrate:sql] SKIP_SQL_MIGRATIONS set — skipping numbered SQL migrations.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url || !String(url).startsWith("postgres")) {
    console.error("[migrate:sql] DATABASE_URL must be set to a PostgreSQL connection string.");
    process.exit(1);
  }

  const names = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (names.length === 0) {
    console.log("[migrate:sql] No .sql files in migrations/ — nothing to do.");
    return;
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(JOURNAL_DDL);

    const { rows: appliedRows } = await client.query(
      `SELECT filename FROM applied_sql_migrations`,
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    for (const name of names) {
      if (applied.has(name)) continue;

      const fullPath = path.join(migrationsDir, name);
      const sqlText = fs.readFileSync(fullPath, "utf8");
      console.log("[migrate:sql] Applying", name, "…");

      try {
        await client.query(sqlText);
        await client.query(`INSERT INTO applied_sql_migrations (filename) VALUES ($1)`, [name]);
      } catch (e) {
        console.error("[migrate:sql] Failed on", name, e);
        process.exit(1);
      }
    }

    console.log("[migrate:sql] Done —", names.length, "file(s) checked.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[migrate:sql]", e);
  process.exit(1);
});
