-- Per-user custom classification labels (GET/POST /api/classification/categories)

CREATE TABLE IF NOT EXISTS user_classification_labels (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  coins integer NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_classification_labels_user ON user_classification_labels (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_class_labels_user_lower
  ON user_classification_labels (user_id, lower(label));
