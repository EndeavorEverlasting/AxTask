-- Replace expression unique index with generated label_lower + plain index (fixes drizzle-kit push introspection Zod error).

ALTER TABLE user_classification_labels
  ADD COLUMN IF NOT EXISTS label_lower text GENERATED ALWAYS AS (lower(label)) STORED;

DROP INDEX IF EXISTS ux_user_class_labels_user_lower;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_class_labels_user_lower
  ON user_classification_labels (user_id, label_lower);
