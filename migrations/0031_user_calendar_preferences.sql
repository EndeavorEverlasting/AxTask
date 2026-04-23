-- Per-user task calendar: optional public holidays overlay + region for holiday data.
CREATE TABLE IF NOT EXISTS user_calendar_preferences (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_holidays BOOLEAN NOT NULL DEFAULT TRUE,
  holiday_country_code VARCHAR(2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
