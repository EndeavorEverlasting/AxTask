-- Base-table safety net for clean SQL-only restores.
-- Some historical migrations only ALTERed these tables; this migration
-- ensures deterministic CREATE + required columns/indexes if absent.

CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
  "user_id" varchar PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "intensity" integer NOT NULL DEFAULT 50,
  "grocery_reminder_enabled" boolean NOT NULL DEFAULT true,
  "grocery_auto_create_task_enabled" boolean NOT NULL DEFAULT false,
  "grocery_auto_notify_enabled" boolean NOT NULL DEFAULT false,
  "quiet_hours_start" integer,
  "quiet_hours_end" integer,
  "feedback_nudge_prefs" jsonb DEFAULT '{"master":50,"byAvatar":{}}'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "intensity" integer NOT NULL DEFAULT 50;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "grocery_reminder_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "grocery_auto_create_task_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "grocery_auto_notify_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "quiet_hours_start" integer;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "quiet_hours_end" integer;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "feedback_nudge_prefs" jsonb DEFAULT '{"master":50,"byAvatar":{}}'::jsonb;
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "user_push_subscriptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "expiration_time" integer,
  "user_agent" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "last_seen_at" timestamp DEFAULT now(),
  "last_sent_at" timestamp
);

ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "endpoint" text;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "p256dh" text;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "auth" text;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "expiration_time" integer;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp DEFAULT now();
ALTER TABLE "user_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "last_sent_at" timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_push_subscriptions'
      AND constraint_name = 'user_push_subscriptions_pkey'
  ) THEN
    ALTER TABLE "user_push_subscriptions"
      ADD CONSTRAINT "user_push_subscriptions_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

ALTER TABLE "user_push_subscriptions"
  ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "user_push_subscriptions"
  ALTER COLUMN "endpoint" SET NOT NULL;
ALTER TABLE "user_push_subscriptions"
  ALTER COLUMN "p256dh" SET NOT NULL;
ALTER TABLE "user_push_subscriptions"
  ALTER COLUMN "auth" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_push_subscriptions_endpoint"
  ON "user_push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "idx_user_push_subscriptions_user"
  ON "user_push_subscriptions" ("user_id");
