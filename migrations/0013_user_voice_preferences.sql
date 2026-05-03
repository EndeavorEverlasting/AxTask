-- Voice command listening mode (cross-device user preference).
CREATE TABLE IF NOT EXISTS user_voice_preferences (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  listening_mode TEXT NOT NULL DEFAULT 'wake_after_first_use',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT user_voice_preferences_listening_mode_check
    CHECK (listening_mode IN ('manual', 'wake_after_first_use'))
);
