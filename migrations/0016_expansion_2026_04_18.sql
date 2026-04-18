-- Expansion batch 2026-04-18: rewards dual-unlock, classification thumbs, alarm snapshots,
-- collaboration inbox, location places.

BEGIN;

ALTER TABLE "rewards_catalog"
  ADD COLUMN IF NOT EXISTS "unlock_at_avatar_level" integer;

CREATE TABLE IF NOT EXISTS "task_classification_thumbs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" varchar NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "ux_task_classification_thumbs_task_user" UNIQUE ("task_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_task_classification_thumbs_task"
  ON "task_classification_thumbs" ("task_id");

CREATE TABLE IF NOT EXISTS "user_alarm_snapshots" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_key" text NOT NULL DEFAULT 'default',
  "label" text NOT NULL DEFAULT 'capture',
  "payload_json" text NOT NULL,
  "captured_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_alarm_snapshots_user"
  ON "user_alarm_snapshots" ("user_id");

CREATE TABLE IF NOT EXISTS "collaboration_inbox_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sender_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "task_id" varchar REFERENCES "tasks"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_collab_inbox_user"
  ON "collaboration_inbox_messages" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_collab_inbox_created"
  ON "collaboration_inbox_messages" ("created_at");

CREATE TABLE IF NOT EXISTS "user_location_places" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "lat" double precision,
  "lng" double precision,
  "radius_meters" integer NOT NULL DEFAULT 200,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_location_places_user"
  ON "user_location_places" ("user_id");

UPDATE "rewards_catalog"
SET "unlock_at_avatar_level" = 5
WHERE "name" = 'Midnight Theme' AND "unlock_at_avatar_level" IS NULL;

UPDATE "rewards_catalog"
SET "unlock_at_avatar_level" = 8
WHERE "name" = 'Avatar Support Unlock' AND "unlock_at_avatar_level" IS NULL;

COMMIT;
