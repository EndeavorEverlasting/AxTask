BEGIN;

CREATE TABLE IF NOT EXISTS study_decks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  source_type text NOT NULL DEFAULT 'manual',
  source_ref text,
  card_limit_per_session integer NOT NULL DEFAULT 10,
  session_duration_minutes integer NOT NULL DEFAULT 5,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_decks_user ON study_decks (user_id);
CREATE INDEX IF NOT EXISTS idx_study_decks_source ON study_decks (source_type);

CREATE TABLE IF NOT EXISTS study_cards (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id varchar NOT NULL REFERENCES study_decks(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  answer text NOT NULL,
  topic text,
  tags_json text,
  source_task_id varchar REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_cards_deck ON study_cards (deck_id);
CREATE INDEX IF NOT EXISTS idx_study_cards_user ON study_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_study_cards_source_task ON study_cards (source_task_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id varchar NOT NULL REFERENCES study_decks(id) ON DELETE CASCADE,
  game_type text NOT NULL DEFAULT 'flashcard_sprint',
  status text NOT NULL DEFAULT 'active',
  started_at timestamp DEFAULT now(),
  ended_at timestamp,
  total_cards integer NOT NULL DEFAULT 0,
  answered_cards integer NOT NULL DEFAULT 0,
  correct_cards integer NOT NULL DEFAULT 0,
  score_percent integer NOT NULL DEFAULT 0,
  avg_response_ms integer,
  weak_topics_json text,
  reward_coins integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON study_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_deck ON study_sessions (deck_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_status ON study_sessions (status);

CREATE TABLE IF NOT EXISTS study_review_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id varchar NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  card_id varchar NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
  grade text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  response_ms integer,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_events_user ON study_review_events (user_id);
CREATE INDEX IF NOT EXISTS idx_study_events_session ON study_review_events (session_id);
CREATE INDEX IF NOT EXISTS idx_study_events_card ON study_review_events (card_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_study_events_session_card_created ON study_review_events (session_id, card_id, created_at);

COMMIT;
