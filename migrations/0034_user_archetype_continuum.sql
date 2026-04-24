-- User-level archetype continuum: five nonnegative integer weights (milli-basis
-- points) that sum to 100_000 = 1.0. Updated via exponential moving average
-- from avatar/archetype behavioral signals (no PII beyond user_id).

CREATE TABLE IF NOT EXISTS user_archetype_continuum (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  milli_momentum integer NOT NULL DEFAULT 20000,
  milli_strategy integer NOT NULL DEFAULT 20000,
  milli_execution integer NOT NULL DEFAULT 20000,
  milli_collaboration integer NOT NULL DEFAULT 20000,
  milli_recovery integer NOT NULL DEFAULT 20000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_archetype_continuum_sum CHECK (
    milli_momentum + milli_strategy + milli_execution + milli_collaboration + milli_recovery = 100000
  ),
  CONSTRAINT chk_user_archetype_continuum_nonneg CHECK (
    milli_momentum >= 0 AND milli_strategy >= 0 AND milli_execution >= 0
    AND milli_collaboration >= 0 AND milli_recovery >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_user_archetype_continuum_updated ON user_archetype_continuum (updated_at);
