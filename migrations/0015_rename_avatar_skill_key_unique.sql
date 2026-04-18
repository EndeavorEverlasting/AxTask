-- Align avatar_skill_nodes.skill_key unique constraint name with Drizzle schema
-- (`.unique("avatar_skill_nodes_skill_key_unique")`). Raw SQL inline UNIQUE in 0011
-- produced the Postgres default name `avatar_skill_nodes_skill_key_key`, causing
-- `drizzle-kit push` to attempt a rename/add and prompt for truncation in production.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'avatar_skill_nodes_skill_key_key'
      AND conrelid = 'avatar_skill_nodes'::regclass
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'avatar_skill_nodes_skill_key_unique'
      AND conrelid = 'avatar_skill_nodes'::regclass
  ) THEN
    ALTER TABLE avatar_skill_nodes
      RENAME CONSTRAINT avatar_skill_nodes_skill_key_key
      TO avatar_skill_nodes_skill_key_unique;
  END IF;
END
$$;
