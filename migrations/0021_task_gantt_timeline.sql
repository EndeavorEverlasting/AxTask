-- Gantt timeline fields on tasks + seed the Gantt Timeline Pack reward.
-- Additive and nullable: existing tasks continue to function; the Gantt view
-- falls back to `date`/`time`/`effort` when the new fields are absent.

BEGIN;

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "start_date" text,
  ADD COLUMN IF NOT EXISTS "end_date" text,
  ADD COLUMN IF NOT EXISTS "duration_minutes" integer,
  ADD COLUMN IF NOT EXISTS "depends_on" jsonb;

-- Seed the customization pack that unlocks advanced Gantt features.
-- Matches seedRewardsCatalog() in server/storage.ts; kept idempotent so the
-- SQL migration and the runtime seeder never fight.
INSERT INTO "rewards_catalog" (id, name, description, cost, type, icon, data, unlock_at_avatar_level)
SELECT gen_random_uuid(),
       'Gantt Timeline Pack',
       'Unlock swimlanes by classification, dependency arrows, critical-path highlight, priority coloring, and PNG export for the task Gantt view.',
       250,
       'gantt_pack',
       '📊',
       'gantt-custom',
       3
WHERE NOT EXISTS (
  SELECT 1 FROM "rewards_catalog" WHERE type = 'gantt_pack'
);

COMMIT;
