-- Add account-level immersive sounds preference (per-device scope uses localStorage on client).
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS immersive_sounds_enabled boolean NOT NULL DEFAULT false;
