-- Add pattern-learning and classification contribution tables required by merged schema.

CREATE TABLE IF NOT EXISTS task_patterns (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_type text NOT NULL,
  pattern_key text NOT NULL,
  data text NOT NULL DEFAULT '{}',
  confidence integer NOT NULL DEFAULT 0,
  occurrences integer NOT NULL DEFAULT 1,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patterns_user ON task_patterns (user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_user_type ON task_patterns (user_id, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_user_key ON task_patterns (user_id, pattern_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_user_type_key
  ON task_patterns (user_id, pattern_type, pattern_key);

CREATE TABLE IF NOT EXISTS classification_contributions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classification text NOT NULL,
  base_coins_awarded integer NOT NULL DEFAULT 0,
  total_coins_earned integer NOT NULL DEFAULT 0,
  confirmation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_contrib_task ON classification_contributions (task_id);
CREATE INDEX IF NOT EXISTS idx_class_contrib_user ON classification_contributions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_contrib_task_user
  ON classification_contributions (task_id, user_id);

CREATE TABLE IF NOT EXISTS classification_confirmations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id varchar NOT NULL REFERENCES classification_contributions(id) ON DELETE CASCADE,
  task_id varchar NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_confirm_contrib ON classification_confirmations (contribution_id);
CREATE INDEX IF NOT EXISTS idx_class_confirm_task ON classification_confirmations (task_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_confirm_task_user
  ON classification_confirmations (task_id, user_id);
