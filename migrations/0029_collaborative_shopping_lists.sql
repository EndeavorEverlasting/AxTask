-- Dedicated collaborative shopping lists (members + items), separate from tasks.
BEGIN;

CREATE TABLE IF NOT EXISTS "shopping_lists" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "created_by_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_shopping_lists_created_by" ON "shopping_lists" ("created_by_user_id");

CREATE TABLE IF NOT EXISTS "shopping_list_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "list_id" varchar NOT NULL REFERENCES "shopping_lists"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'editor',
  "invited_by" varchar REFERENCES "users"("id"),
  "invited_at" timestamp DEFAULT now(),
  CONSTRAINT "ux_shopping_list_members_list_user" UNIQUE ("list_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_shopping_list_members_user" ON "shopping_list_members" ("user_id");

CREATE TABLE IF NOT EXISTS "shopping_list_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "list_id" varchar NOT NULL REFERENCES "shopping_lists"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "purchased" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purchased_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "purchased_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_shopping_list_items_list_sort" ON "shopping_list_items" ("list_id", "sort_order");

COMMIT;
