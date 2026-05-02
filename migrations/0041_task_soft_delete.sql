-- Soft-delete support for tasks (Backup Fortress Sprint 1)
BEGIN;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_by" varchar(256);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "delete_reason" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "purge_after" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "restore_count" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_tasks_user_deleted_at" ON "tasks" ("user_id", "deleted_at");

COMMIT;
