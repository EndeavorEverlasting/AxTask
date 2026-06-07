-- Provider-reported usage (Neon/Render billing imports) separate from internal app snapshots.
CREATE TABLE IF NOT EXISTS provider_usage_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  project text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric_name text NOT NULL,
  metric_unit text NOT NULL,
  metric_value double precision NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  raw_json jsonb,
  imported_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_period
  ON provider_usage_snapshots (provider, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_provider_usage_metric
  ON provider_usage_snapshots (provider, metric_name, period_start);

-- Idempotent imports: one row per provider/project/branch/period/metric/source.
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_usage_natural_key
  ON provider_usage_snapshots (
    provider,
    COALESCE(project, ''),
    COALESCE(branch, ''),
    period_start,
    period_end,
    metric_name,
    source
  );

-- Optional daily attribution rollup on internal usage snapshots.
ALTER TABLE usage_snapshots
  ADD COLUMN IF NOT EXISTS attribution_json jsonb;
