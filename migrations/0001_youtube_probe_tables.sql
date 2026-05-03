-- YouTube contextual probe state + feedback (Drizzle mirrors in shared/schema.ts).
-- Apply with db:push, or run this SQL manually on environments that use SQL migrations only.
-- If this file was applied before the updated_at trigger block existed, run only the
-- CREATE OR REPLACE FUNCTION … through CREATE TRIGGER section below on the target DB once.

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

-- Keep updated_at fresh on row updates (app upsert also sets it; this covers ad-hoc SQL).
CREATE OR REPLACE FUNCTION update_user_youtube_probe_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_youtube_probe_state_updated_at ON user_youtube_probe_state;
CREATE TRIGGER update_user_youtube_probe_state_updated_at
  BEFORE UPDATE ON user_youtube_probe_state
  FOR EACH ROW
  EXECUTE PROCEDURE update_user_youtube_probe_state_updated_at();
