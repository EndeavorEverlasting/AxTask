-- Community forum tables (orb-driven dialogue) and task-level attachment support.
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.

BEGIN;

-- ── Community Posts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "avatar_key" text NOT NULL,
  "avatar_name" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text NOT NULL DEFAULT 'general',
  "related_task_id" varchar REFERENCES "tasks"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_community_posts_avatar"
  ON "community_posts" ("avatar_key");
CREATE INDEX IF NOT EXISTS "idx_community_posts_created"
  ON "community_posts" ("created_at");

-- ── Community Replies ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "community_replies" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" varchar NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "avatar_key" text,
  "display_name" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_community_replies_post"
  ON "community_replies" ("post_id");

-- ── Attachment Assets: add task_id column ───────────────────────────────────
ALTER TABLE "attachment_assets"
  ADD COLUMN IF NOT EXISTS "task_id" varchar
  REFERENCES "tasks"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_attachment_assets_task"
  ON "attachment_assets" ("task_id");

-- ── Storage Policies: widen max_attachment_bytes to bigint (15 GB+) ─────────
-- ALTER COLUMN TYPE is not IF NOT EXISTS, so guard with a DO block.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_policies'
      AND column_name = 'max_attachment_bytes'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "storage_policies"
      ALTER COLUMN "max_attachment_bytes" TYPE bigint;
    ALTER TABLE "storage_policies"
      ALTER COLUMN "max_attachment_bytes" SET DEFAULT 16106127360;
  END IF;
END $$;

COMMIT;

