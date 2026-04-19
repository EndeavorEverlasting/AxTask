-- 0022_classification_disputes
--
-- Peer-challenge tables for auto-classifications. Additive to the existing
-- classification_contributions / classification_confirmations economic-consensus
-- path from migration 0010. See shared/schema.ts (classificationDisputes et al)
-- and docs/BASELINE_PUBLISHED_AUDIT.md section 4b #7 for scope rationale.
--
-- Per migrations/0019_archetype_empathy_analytics.sql convention and
-- docs/DEV_DATABASE_AND_SCHEMA.md, everything is idempotent:
-- CI replays this on top of a fresh `drizzle-kit push` per the PR #9 ordering
-- (`server/ci-migration-order.contract.test.ts`).

CREATE TABLE IF NOT EXISTS classification_disputes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_category text NOT NULL,
  suggested_category text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_dispute_task ON classification_disputes (task_id);
CREATE INDEX IF NOT EXISTS idx_class_dispute_user ON classification_disputes (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_class_dispute_task_user
  ON classification_disputes (task_id, user_id);

CREATE TABLE IF NOT EXISTS classification_dispute_votes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id varchar NOT NULL REFERENCES classification_disputes(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agree boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_dispute_votes_dispute
  ON classification_dispute_votes (dispute_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_class_dispute_votes_user_dispute
  ON classification_dispute_votes (user_id, dispute_id);

CREATE TABLE IF NOT EXISTS category_review_triggers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  original_category text NOT NULL,
  suggested_category text NOT NULL,
  dispute_count integer NOT NULL DEFAULT 0,
  agree_count integer NOT NULL DEFAULT 0,
  total_votes integer NOT NULL DEFAULT 0,
  consensus_ratio double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'monitoring',
  resolved_at timestamptz,
  resolved_by varchar,
  resolve_outcome text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crt_original
  ON category_review_triggers (original_category);
CREATE INDEX IF NOT EXISTS idx_crt_status
  ON category_review_triggers (status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_crt_category_pair
  ON category_review_triggers (original_category, suggested_category);
