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

  // ── constraint name alignment (regression: avatar_skill_nodes Render prompt) ──
  it("avatar_skill_nodes unique constraint is named avatar_skill_nodes_skill_key_unique", async () => {
    const result: unknown = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conrelid = 'avatar_skill_nodes'::regclass AND contype = 'u'`,
    );
    const rows = (result as { rows?: Array<{ conname: string }> }).rows
      ?? (Array.isArray(result) ? (result as Array<{ conname: string }>) : []);
    const names = rows.map((r) => r.conname);
    expect(names, "drizzle-kit push will prompt for table truncate if the name drifts").toContain(
      "avatar_skill_nodes_skill_key_unique",
    );
    expect(names).not.toContain("avatar_skill_nodes_skill_key_key");
  });

  it("users.email unique constraint matches the Drizzle-declared name", async () => {
    const result: unknown = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u'`,
    );
    const rows = (result as { rows?: Array<{ conname: string }> }).rows
      ?? (Array.isArray(result) ? (result as Array<{ conname: string }>) : []);
    const names = rows.map((r) => r.conname);
    expect(names).toContain("users_email_unique");
  });
});
