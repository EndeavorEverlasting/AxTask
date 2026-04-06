#!/usr/bin/env node
/**
 * One-time cleanup before applying uniqueIndex ux_user_rewards_user_reward on user_rewards.
 * Keeps the earliest redeemed row per (user_id, reward_id) (by redeemed_at, then id); deletes newer duplicates.
 *
 * Usage: DATABASE_URL=... node scripts/migration/dedupe-user-rewards.mjs
 * Or:    npm run migration:dedupe-user-rewards
 */
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[dedupe-user-rewards] DATABASE_URL is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const result = await pool.query(`
    DELETE FROM user_rewards AS a
    USING user_rewards AS b
    WHERE a.user_id = b.user_id
      AND a.reward_id = b.reward_id
      AND (
        COALESCE(a.redeemed_at, '-infinity'::timestamptz) > COALESCE(b.redeemed_at, '-infinity'::timestamptz)
        OR (
          COALESCE(a.redeemed_at, '-infinity'::timestamptz) IS NOT DISTINCT FROM COALESCE(b.redeemed_at, '-infinity'::timestamptz)
          AND a.id > b.id
        )
      )
  `);
  const n = result.rowCount ?? 0;
  console.log(`[dedupe-user-rewards] Removed ${n} duplicate row(s); kept oldest redeemed_at per (user_id, reward_id).`);
} catch (e) {
  console.error("[dedupe-user-rewards] Failed:", e);
  process.exit(1);
} finally {
  await pool.end();
}
