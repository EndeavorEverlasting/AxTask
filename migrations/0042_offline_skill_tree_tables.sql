-- Add offline skill tree persistence tables.
-- Mirrors shared/schema/gamification.ts:
--   offlineSkillNodes
--   userOfflineSkills
--
-- This closes the schema/migration drift where the candidate schema defined
-- offline skill persistence but clean database migration history did not create it.

CREATE TABLE IF NOT EXISTS "offline_skill_nodes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "skill_key" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "branch" text NOT NULL,
  "max_level" integer NOT NULL DEFAULT 1,
  "base_cost" integer NOT NULL DEFAULT 100,
  "effect_type" text NOT NULL,
  "effect_per_level" integer NOT NULL DEFAULT 0,
  "prerequisite_skill_key" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "offline_skill_nodes_skill_key_unique" UNIQUE ("skill_key")
);

CREATE INDEX IF NOT EXISTS "idx_offline_skill_nodes_branch"
  ON "offline_skill_nodes" ("branch");

CREATE INDEX IF NOT EXISTS "idx_offline_skill_nodes_sort"
  ON "offline_skill_nodes" ("sort_order");

CREATE TABLE IF NOT EXISTS "user_offline_skills" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_node_id" varchar NOT NULL REFERENCES "offline_skill_nodes"("id") ON DELETE CASCADE,
  "level" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_offline_skills_user_node"
  ON "user_offline_skills" ("user_id", "skill_node_id");

CREATE INDEX IF NOT EXISTS "idx_user_offline_skills_user"
  ON "user_offline_skills" ("user_id");
