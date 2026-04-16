-- Multi-label classification JSON + classification confirmation ledger
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "classification_associations" jsonb;

UPDATE "tasks"
SET "classification_associations" = jsonb_build_array(
  jsonb_build_object('label', "classification", 'confidence', 1)
)
WHERE "classification_associations" IS NULL AND "classification" IS NOT NULL AND length(trim("classification")) > 0;

CREATE TABLE IF NOT EXISTS "task_classification_confirmations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" varchar NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_task_classification_confirmations_task_user"
  ON "task_classification_confirmations" ("task_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_task_classification_confirmations_task"
  ON "task_classification_confirmations" ("task_id");
