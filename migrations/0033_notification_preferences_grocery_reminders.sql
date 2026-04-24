-- Grocery reminder controls: suggest-first baseline + opt-in automation.
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS grocery_reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS grocery_auto_create_task_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS grocery_auto_notify_enabled boolean NOT NULL DEFAULT false;
