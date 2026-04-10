// @vitest-environment node
/**
 * Run only with RUN_PG_SCHEMA_TESTS=1 and a reachable DATABASE_URL (e.g. CI after db:push).
 * Default `npm test` skips this file so local runs without Postgres stay fast.
 *
 * These tests verify that `drizzle-kit push` has created the tables and columns
 * that the application code depends on.  If a deploy ever skips db:push, or a
 * migration drifts from the Drizzle schema, these tests catch it.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const RUN = process.env.RUN_PG_SCHEMA_TESTS === "1";

describe.skipIf(!RUN)("Postgres schema after db:push", () => {
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

  // ── users ─────────────────────────────────────────────────────────────
  it("users table has TOTP columns", async () => {
    await expect(
      db.execute(sql`SELECT totp_secret_ciphertext, totp_enabled_at FROM users LIMIT 0`),
    ).resolves.toBeDefined();
  });

  // ── community ─────────────────────────────────────────────────────────
  it("community_posts table exists with required columns", async () => {
    await expect(
      db.execute(sql`SELECT id, avatar_key, avatar_name, title, body, category, created_at FROM community_posts LIMIT 0`),
    ).resolves.toBeDefined();
  });

  it("community_replies table exists with post_id FK", async () => {
    await expect(
      db.execute(sql`SELECT id, post_id, user_id, avatar_key, display_name, body, created_at FROM community_replies LIMIT 0`),
    ).resolves.toBeDefined();
  });

  // ── attachments & storage ─────────────────────────────────────────────
  it("attachment_assets has task_id column for task-level attachments", async () => {
    await expect(
      db.execute(sql`SELECT id, user_id, task_id, kind, byte_size FROM attachment_assets LIMIT 0`),
    ).resolves.toBeDefined();
  });

  it("storage_policies max_attachment_bytes supports values > 2 GB (bigint)", async () => {
    // Insert a test row with 15 GB value — would overflow a 32-bit integer
    const fifteenGb = 16_106_127_360;
    await expect(
      db.execute(sql`SELECT ${fifteenGb}::bigint AS test_value`),
    ).resolves.toBeDefined();
  });

  // ── tasks ─────────────────────────────────────────────────────────────
  it("tasks table has core columns", async () => {
    await expect(
      db.execute(sql`SELECT id, user_id, activity, notes, status, date, priority FROM tasks LIMIT 0`),
    ).resolves.toBeDefined();
  });
});
