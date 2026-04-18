-- 0020_attachment_composer_links
--
-- Polymorphic join that links attachment_assets rows to any composer owner
-- (collab inbox message, community post/reply, feedback report, task note).
-- The paste composer uses this table so that attachments are cleaned up via
-- cascade delete when the parent row goes away, and so the server can reject
-- attachment:<id> references that belong to other users.
--
-- See docs/PASTE_COMPOSER_SECURITY.md for the full threat model.
-- Idempotent so scripts/apply-migrations.mjs can safely re-run.

CREATE TABLE IF NOT EXISTS message_attachments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL,
  owner_id varchar NOT NULL,
  asset_id varchar NOT NULL REFERENCES attachment_assets(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_owner
  ON message_attachments (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_asset
  ON message_attachments (asset_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_user
  ON message_attachments (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_message_attachments_owner_asset
  ON message_attachments (owner_type, owner_id, asset_id);
