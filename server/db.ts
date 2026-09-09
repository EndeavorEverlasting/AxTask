import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import {
  resolveDbConnectionTimeoutMs,
  stripDatabaseUrlApplicationName,
} from "./db-runtime";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: stripDatabaseUrlApplicationName(process.env.DATABASE_URL),
  connectionTimeoutMillis: resolveDbConnectionTimeoutMs(
    process.env.AXTASK_DB_CONNECTION_TIMEOUT_MS,
  ),
  application_name: "axtask",
});

pool.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException)?.code;
  const hint =
    code === "ECONNREFUSED"
      ? "Database refused the connection. Start Postgres (for example `npm run docker:start` from the repo root), then confirm `DATABASE_URL` in `.env` matches the running instance. See docs/DEV_DATABASE_AND_SCHEMA.md."
      : "Check DATABASE_URL and database availability.";
  console.warn(`[db] Unexpected pool error (${code || "unknown"}): ${err.message}. ${hint}`);
});

export const db = drizzle(pool, { schema });
