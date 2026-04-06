-- Idempotent: remove duplicate (user_id, reward_id) rows before unique index ux_user_rewards_user_reward.
-- Keeps the row with the lexicographically greatest id per pair. Safe to re-run.
BEGIN;

DELETE FROM user_rewards AS a
USING user_rewards AS b
WHERE a.user_id = b.user_id
  AND a.reward_id = b.reward_id
  AND a.id < b.id;

COMMIT;
