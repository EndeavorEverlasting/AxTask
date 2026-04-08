-- Product funnel signals for roadmap triage (see docs/PRODUCT_ROADMAP.md).
BEGIN;

CREATE TABLE IF NOT EXISTS product_funnel_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  meta_json text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_funnel_events_name_created
  ON product_funnel_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_funnel_events_user_created
  ON product_funnel_events (user_id, created_at DESC);

COMMIT;
