-- task_collaborators: required before 0003_task_collaborators_role_check.sql (ALTER/CHECK).
-- Fresh production DBs never had a CREATE; older envs may already have this table from drizzle push.
BEGIN;

CREATE TABLE IF NOT EXISTS "task_collaborators" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" varchar NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'editor',
  "invited_at" timestamp DEFAULT now(),
  CONSTRAINT "ux_task_collaborators_task_user" UNIQUE ("task_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_task_collaborators_task_id" ON "task_collaborators" ("task_id");
CREATE INDEX IF NOT EXISTS "idx_task_collaborators_user_id" ON "task_collaborators" ("user_id");

COMMIT;
