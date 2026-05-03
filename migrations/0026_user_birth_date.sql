-- Optional calendar date for in-app milestones (YYYY-MM-DD). Exposed only via GET /api/account/profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date text;
