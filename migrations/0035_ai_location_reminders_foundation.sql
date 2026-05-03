-- Gentle Reminder PR1: extend user_location_places, add events/reminders/AI interaction tables.
-- See shared/schema/ops.ts (LOCATION_* , userLocationEvents, userReminders, userReminderTriggers, aiInteractions).

-- ─── user_location_places: new columns (legacy `name` retained for API contract) ───
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "place_type" text NOT NULL DEFAULT 'custom';
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "label" text;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual_pin';
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "geocode_accuracy_meters" integer;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "last_entered_at" timestamp;
ALTER TABLE "user_location_places" ADD COLUMN IF NOT EXISTS "last_exited_at" timestamp;

UPDATE "user_location_places" SET "label" = "name" WHERE "label" IS NULL;
UPDATE "user_location_places" SET "slug" = 'p' || replace("id"::text, '-', '') WHERE "slug" IS NULL OR trim("slug") = '';

ALTER TABLE "user_location_places" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "user_location_places" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_location_places_user_slug"
  ON "user_location_places" ("user_id", "slug");

CREATE INDEX IF NOT EXISTS "idx_user_location_places_user_type"
  ON "user_location_places" ("user_id", "place_type");

-- At most one active default home / work per user.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_location_places_user_default_home"
  ON "user_location_places" ("user_id")
  WHERE "place_type" = 'home' AND "is_default" = true AND "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_location_places_user_default_work"
  ON "user_location_places" ("user_id")
  WHERE "place_type" = 'work' AND "is_default" = true AND "is_active" = true;

-- ─── user_location_events ───
CREATE TABLE IF NOT EXISTS "user_location_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "place_id" varchar NOT NULL REFERENCES "user_location_places"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "source" text NOT NULL DEFAULT 'browser',
  "confidence" integer NOT NULL DEFAULT 100,
  "metadata_json" jsonb DEFAULT '{}'::jsonb,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_location_events_user_time"
  ON "user_location_events" ("user_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "idx_user_location_events_place_time"
  ON "user_location_events" ("place_id", "occurred_at");

-- ─── user_reminders + user_reminder_triggers ───
CREATE TABLE IF NOT EXISTS "user_reminders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" text NOT NULL DEFAULT 'user',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_reminders_user_enabled"
  ON "user_reminders" ("user_id", "enabled");

CREATE TABLE IF NOT EXISTS "user_reminder_triggers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "reminder_id" varchar NOT NULL REFERENCES "user_reminders"("id") ON DELETE CASCADE,
  "trigger_type" text NOT NULL,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "next_run_at" timestamp,
  "last_triggered_at" timestamp,
  "cooldown_seconds" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_reminder_triggers_next_run"
  ON "user_reminder_triggers" ("next_run_at");

CREATE INDEX IF NOT EXISTS "idx_user_reminder_triggers_reminder"
  ON "user_reminder_triggers" ("reminder_id");

-- ─── ai_interactions (audit; not notification prefs) ───
CREATE TABLE IF NOT EXISTS "ai_interactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" text,
  "raw_message" text NOT NULL,
  "intent_kind" text,
  "structured_output_json" jsonb,
  "provider" text,
  "model" text,
  "latency_ms" integer,
  "accepted" boolean,
  "rejected_reason" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ai_interactions_user_created"
  ON "ai_interactions" ("user_id", "created_at");
