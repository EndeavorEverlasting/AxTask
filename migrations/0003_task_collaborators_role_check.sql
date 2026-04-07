-- Align DB with shared/schema task_collaborators check (viewer | editor | commenter).
BEGIN;

ALTER TABLE task_collaborators DROP CONSTRAINT IF EXISTS task_collaborators_role_check;
ALTER TABLE task_collaborators
  ADD CONSTRAINT task_collaborators_role_check CHECK (role IN ('viewer', 'editor', 'commenter'));

COMMIT;
