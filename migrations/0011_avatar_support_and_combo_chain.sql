-- Avatar support skill tree + wallet combo/chain tracking.

ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "combo_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "best_combo_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "combo_window_started_at" timestamp;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "last_completion_at" timestamp;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "chain_count_24h" integer NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "best_chain_count_24h" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "avatar_skill_nodes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "branch" text NOT NULL,
  "max_level" integer NOT NULL DEFAULT 1,
  "base_cost" integer NOT NULL DEFAULT 100,
  "effect_type" text NOT NULL,
  "effect_per_level" integer NOT NULL DEFAULT 0,
  "prerequisite_skill_key" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_avatar_skill_nodes_branch"
  ON "avatar_skill_nodes" ("branch");
CREATE INDEX IF NOT EXISTS "idx_avatar_skill_nodes_sort"
  ON "avatar_skill_nodes" ("sort_order");

CREATE TABLE IF NOT EXISTS "user_avatar_skills" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_node_id" varchar NOT NULL REFERENCES "avatar_skill_nodes"("id") ON DELETE CASCADE,
  "level" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_avatar_skills_user_node"
  ON "user_avatar_skills" ("user_id", "skill_node_id");
CREATE INDEX IF NOT EXISTS "idx_user_avatar_skills_user"
  ON "user_avatar_skills" ("user_id");

CREATE TABLE IF NOT EXISTS "user_avatar_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "avatar_key" text NOT NULL,
  "display_name" text NOT NULL,
  "archetype_key" text NOT NULL,
  "level" integer NOT NULL DEFAULT 1,
  "xp" integer NOT NULL DEFAULT 0,
  "total_xp" integer NOT NULL DEFAULT 0,
  "mission" text NOT NULL DEFAULT 'Complete a task to gain XP.',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_avatar_profiles_user_avatar"
  ON "user_avatar_profiles" ("user_id", "avatar_key");
CREATE INDEX IF NOT EXISTS "idx_user_avatar_profiles_user"
  ON "user_avatar_profiles" ("user_id");

INSERT INTO "rewards_catalog" ("id", "name", "description", "cost", "type", "icon", "data")
SELECT gen_random_uuid(), 'Avatar Support Unlock', 'Unlock the avatar support tree for guided task management', 220, 'avatar_support', '🧭', 'avatar-support-unlock'
WHERE NOT EXISTS (
  SELECT 1
  FROM "rewards_catalog"
  WHERE "type" = 'avatar_support' AND "data" = 'avatar-support-unlock'
);
