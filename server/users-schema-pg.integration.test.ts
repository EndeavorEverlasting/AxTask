// @vitest-environment node
/**
 * Run only with RUN_PG_SCHEMA_TESTS=1 and a reachable DATABASE_URL (e.g. CI after db:push).
 * Default `npm test` skips this file so local runs without Postgres stay fast.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const RUN = process.env.RUN_PG_SCHEMA_TESTS === "1";

describe.skipIf(!RUN)("Postgres users table: TOTP columns exist", () => {
  let pool: { end: () => Promise<void> };
  let db: { execute: (q: unknown) => Promise<unknown> };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_PG_SCHEMA_TESTS=1");
    }
    vi.resetModules();
    const mod = await import("./db");
    db = mod.db;
    pool = mod.pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("can select totp_secret_ciphertext and totp_enabled_at (schema matches app)", async () => {
    await expect(
      db.execute(sql`select totp_secret_ciphertext, totp_enabled_at from users limit 0`),
    ).resolves.toBeDefined();
  });
});
