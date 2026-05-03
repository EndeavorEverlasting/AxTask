-- 0025_archetype_polls
--
-- Orb-scheduled community polls with archetype-bucketed aggregates (public
-- after close). Idempotent CREATE IF NOT EXISTS per docs/DEV_DATABASE_AND_SCHEMA.md.

BEGIN;

CREATE TABLE IF NOT EXISTS archetype_polls (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'scheduled',
  opens_at timestamp NOT NULL,
  closes_at timestamp NOT NULL,
  author_avatar_key text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archetype_polls_status ON archetype_polls (status);
CREATE INDEX IF NOT EXISTS idx_archetype_polls_opens ON archetype_polls (opens_at);
CREATE INDEX IF NOT EXISTS idx_archetype_polls_closes ON archetype_polls (closes_at);

CREATE TABLE IF NOT EXISTS archetype_poll_options (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id varchar NOT NULL REFERENCES archetype_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_archetype_poll_options_poll ON archetype_poll_options (poll_id);

CREATE TABLE IF NOT EXISTS archetype_poll_votes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id varchar NOT NULL REFERENCES archetype_polls(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id varchar NOT NULL REFERENCES archetype_poll_options(id) ON DELETE CASCADE,
  archetype_key text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archetype_poll_votes_poll_user
  ON archetype_poll_votes (poll_id, user_id);
CREATE INDEX IF NOT EXISTS idx_archetype_poll_votes_poll ON archetype_poll_votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_archetype_poll_votes_option ON archetype_poll_votes (option_id);

COMMIT;
