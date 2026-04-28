-- Durable task-linked reminder rows (command engine); delivery workers (e.g. alarm companion) consume these.
-- Reconciles with ops `user_reminders` / `user_reminder_triggers` for NL + location-offset flows — see docs/REMINDER_MODEL_RECONCILIATION.md
CREATE TABLE IF NOT EXISTS "task_reminders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id" varchar REFERENCES "tasks"("id") ON DELETE SET NULL,
  "activity" text NOT NULL,
  "remind_at" timestamptz NOT NULL,
  "recurrence_rule" text,
  "delivery_channel" text NOT NULL DEFAULT 'auto',
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_task_reminders_user" ON "task_reminders" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_task_reminders_remind_at" ON "task_reminders" ("remind_at");
