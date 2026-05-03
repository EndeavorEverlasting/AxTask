-- 0019_archetype_empathy_analytics
--
-- Archetype-level empathy analytics tables. Populated by the archetype-rollup
-- worker from `security_events` rows with `event_type='archetype_signal'`.
-- Only `archetype_key` is stored; no per-user columns. See
-- docs/ARCHETYPE_EMPATHY_ANALYTICS.md for the privacy model.
--
-- Idempotent so re-runs via scripts/apply-migrations.mjs are safe.

CREATE TABLE IF NOT EXISTS archetype_rollup_daily (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_key text NOT NULL,
  bucket_date text NOT NULL,
  empathy_score double precision NOT NULL DEFAULT 0,
  samples integer NOT NULL DEFAULT 0,
  signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archetype_rollup_daily_key_date
  ON archetype_rollup_daily (archetype_key, bucket_date);
CREATE INDEX IF NOT EXISTS idx_archetype_rollup_daily_date
  ON archetype_rollup_daily (bucket_date);
CREATE INDEX IF NOT EXISTS idx_archetype_rollup_daily_key
  ON archetype_rollup_daily (archetype_key);

CREATE TABLE IF NOT EXISTS archetype_markov_daily (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  from_archetype text NOT NULL,
  to_archetype text NOT NULL,
  bucket_date text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  computed_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archetype_markov_daily_triple
  ON archetype_markov_daily (from_archetype, to_archetype, bucket_date);
CREATE INDEX IF NOT EXISTS idx_archetype_markov_daily_date
  ON archetype_markov_daily (bucket_date);
CREATE INDEX IF NOT EXISTS idx_archetype_markov_daily_from
  ON archetype_markov_daily (from_archetype);
