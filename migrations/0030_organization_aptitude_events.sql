CREATE TABLE IF NOT EXISTS "organization_aptitude_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "archetype_key" text NOT NULL,
  "points_awarded" integer NOT NULL DEFAULT 0,
  "coins_awarded" integer NOT NULL DEFAULT 0,
  "metadata_json" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_org_aptitude_events_user_created"
  ON "organization_aptitude_events" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_org_aptitude_events_source_created"
  ON "organization_aptitude_events" ("source", "created_at");

CREATE INDEX IF NOT EXISTS "idx_org_aptitude_events_archetype_created"
  ON "organization_aptitude_events" ("archetype_key", "created_at");
