-- Align DB with shared/schema task_collaborators check (viewer | editor | commenter).
BEGIN;

UPDATE task_collaborators
SET role = 'editor'
WHERE role IS NULL OR role NOT IN ('viewer', 'editor', 'commenter');

ALTER TABLE task_collaborators DROP CONSTRAINT IF EXISTS task_collaborators_role_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'task_collaborators_role_check'
      AND t.relname = 'task_collaborators'
  ) THEN
    EXECUTE 'ALTER TABLE task_collaborators ADD CONSTRAINT task_collaborators_role_check CHECK (role IN (''viewer'', ''editor'', ''commenter''))';
  END IF;
END
$$;

COMMIT;
