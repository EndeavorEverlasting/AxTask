CREATE TABLE IF NOT EXISTS user_adherence_state (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_evaluated_at timestamp,
  last_login_at timestamp,
  last_task_mutation_at timestamp,
  last_missed_due_at timestamp,
  last_reminder_ignored_at timestamp,
  last_streak_drop_at timestamp,
  last_no_engagement_at timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adherence_state_updated
  ON user_adherence_state(updated_at);

CREATE TABLE IF NOT EXISTS user_adherence_interventions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  context_json text,
  dedupe_key text NOT NULL,
  push_sent_at timestamp,
  acknowledged_at timestamp,
  dismissed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adherence_interventions_user_status
  ON user_adherence_interventions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_adherence_interventions_signal
  ON user_adherence_interventions(signal);
CREATE INDEX IF NOT EXISTS idx_adherence_interventions_created
  ON user_adherence_interventions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_adherence_interventions_user_dedupe
  ON user_adherence_interventions(user_id, dedupe_key);
