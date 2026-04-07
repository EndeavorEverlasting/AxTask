-- YouTube contextual probe state + feedback (Drizzle mirrors in shared/schema.ts).
-- Apply with db:push, or run this SQL manually on environments that use SQL migrations only.

CREATE TABLE IF NOT EXISTS "user_youtube_probe_state" (
  "user_id" varchar PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_offered_at" timestamp,
  "last_video_id" text,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "youtube_probe_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "video_id" text NOT NULL,
  "reaction" text NOT NULL,
  "probe_version" text DEFAULT '1' NOT NULL,
  "context_snapshot_json" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_youtube_probe_feedback_user" ON "youtube_probe_feedback" ("user_id");
