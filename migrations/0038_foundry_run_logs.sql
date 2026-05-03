-- Append-only agent / dev handoff log (Admin Foundry). Pruned by retention job.
CREATE TABLE IF NOT EXISTS "foundry_run_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_foundry_run_logs_created"
  ON "foundry_run_logs" ("created_at");
