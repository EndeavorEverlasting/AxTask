-- Optional deadline temperament for Gantt / certification UX.
BEGIN;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deadline_type" text;

COMMIT;
