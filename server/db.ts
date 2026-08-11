import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import {
  classifyDbRuntimeError,
  getDbPoolSnapshot,
  resolveDbConnectionTimeoutMs,
} from "./db-runtime";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionTimeoutMillis = resolveDbConnectionTimeoutMs(
  process.env.AXTASK_DB_CONNECTION_TIMEOUT_MS,
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis,
  application_name: "axtask",
});

pool.on("error", (err) => {
  const classified = classifyDbRuntimeError(err) ?? {
    errorClass: "DB_UNKNOWN" as const,
    retryable: false,
    ...(typeof (err as NodeJS.ErrnoException)?.code === "string"
      ? { code: String((err as NodeJS.ErrnoException).code) }
      : {}),
  };
  const event = {
    event: "db_pool_error",
    errorClass: classified.errorClass,
    retryable: classified.retryable,
    code: classified.code,
    pool: getDbPoolSnapshot(pool),
  };
  console.warn(`[db] ${JSON.stringify(event)}`);
});

export const db = drizzle(pool, { schema });
