#!/usr/bin/env node
/**
 * Runs before `drizzle-kit push` in production start.
 *
 * Older DBs may have idx_user_classification_categories_user_name defined as a unique index
 * on (user_id, lower(name)). drizzle-kit introspection turns the expression column into
 * `expression: null` and Zod validation fails before push can run.
 *
 * Dropping the index is idempotent; `push` then recreates the column-only unique index from schema.
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("[pre-db-push] DATABASE_URL unset — skipping kit workarounds.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query(`DROP INDEX IF EXISTS idx_user_classification_categories_user_name;`);
  console.log(
    "[pre-db-push] Dropped idx_user_classification_categories_user_name if present (drizzle-kit introspection workaround).",
  );
} catch (e) {
  console.error("[pre-db-push] Failed to run pre-push SQL:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
