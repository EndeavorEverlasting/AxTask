-- Keep the database contract aligned with shared/schema/tasks.ts.
-- The previous application limit was 10,000 characters, so existing
-- application-created rows should already satisfy this expanded 50,000 cap.

ALTER TABLE "tasks"
  DROP CONSTRAINT IF EXISTS "tasks_notes_max_50000";

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_notes_max_50000"
  CHECK ("notes" IS NULL OR char_length("notes") <= 50000)
  NOT VALID;

ALTER TABLE "tasks"
  VALIDATE CONSTRAINT "tasks_notes_max_50000";
