-- 0018_notification_preferences_feedback_nudge_prefs
--
-- Add a jsonb column to user_notification_preferences to store per-avatar
-- feedback-nudge slider values (master 0..100 + optional byAvatar overrides).
-- Idempotent so re-runs via scripts/apply-migrations.mjs are safe.

ALTER TABLE IF EXISTS user_notification_preferences
  ADD COLUMN IF NOT EXISTS feedback_nudge_prefs jsonb
    NOT NULL DEFAULT '{"master":50,"byAvatar":{}}'::jsonb;

-- Backfill any rows that may have been created with a NULL default under a
-- prior schema build (belt and suspenders; NOT NULL DEFAULT above should
-- already cover new rows).
UPDATE user_notification_preferences
SET feedback_nudge_prefs = '{"master":50,"byAvatar":{}}'::jsonb
WHERE feedback_nudge_prefs IS NULL;
