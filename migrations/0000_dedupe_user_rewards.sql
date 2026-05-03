-- Idempotent: remove duplicate (user_id, reward_id) rows before unique index ux_user_rewards_user_reward.
-- Keeper per group: earliest redeemed_at (NULL sorts as earliest via -infinity); tie-break highest id.
-- Matches scripts/migration/dedupe-user-rewards.mjs. Safe to re-run.
-- Guarded by to_regclass so fresh databases where user_rewards has not yet been
-- created by drizzle-kit (e.g. CI test-and-attest Postgres service on empty DB) are no-ops
-- instead of hard errors.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_rewards') IS NOT NULL THEN
    DELETE FROM user_rewards AS a
    USING user_rewards AS b
    WHERE a.user_id = b.user_id
      AND a.reward_id = b.reward_id
      AND (
        COALESCE(a.redeemed_at, '-infinity'::timestamptz) > COALESCE(b.redeemed_at, '-infinity'::timestamptz)
        OR (
          COALESCE(a.redeemed_at, '-infinity'::timestamptz) IS NOT DISTINCT FROM COALESCE(b.redeemed_at, '-infinity'::timestamptz)
          AND a.id < b.id
        )
      );
  END IF;
END
$$;

COMMIT;
