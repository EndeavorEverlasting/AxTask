-- Track coin spend on shop redemptions for partial sell-back refunds.

BEGIN;

ALTER TABLE "user_rewards"
  ADD COLUMN IF NOT EXISTS "coins_spent_at_redeem" integer NOT NULL DEFAULT 0;

UPDATE "user_rewards" SET "coins_spent_at_redeem" = 0 WHERE "coins_spent_at_redeem" IS NULL;

COMMIT;
