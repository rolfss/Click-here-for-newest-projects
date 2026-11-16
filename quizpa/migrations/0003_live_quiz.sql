CREATE TABLE live_games (
  id TEXT PRIMARY KEY NOT NULL,
  pin TEXT NOT NULL CHECK (length(pin) = 6 AND pin NOT GLOB '*[^0-9]*'),
  source_quiz TEXT NOT NULL REFERENCES quizzes(id),
  source_revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  lobby_expires_at INTEGER NOT NULL,
  phase TEXT NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby', 'question', 'finished', 'cancelled')),
  position INTEGER NOT NULL DEFAULT -1,
  started_at INTEGER,
  deadline INTEGER
);

CREATE UNIQUE INDEX live_games_open_pin ON live_games (pin) WHERE phase = 'lobby';

CREATE TABLE live_players (
  game_id TEXT NOT NULL REFERENCES live_games(id),
  id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  correct_elapsed_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, id),
  UNIQUE (game_id, nickname_key),
  UNIQUE (game_id, access_hash)
);

CREATE TABLE live_answers (
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  selected INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  points INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id, position),
  FOREIGN KEY (game_id, player_id) REFERENCES live_players(game_id, id)
);

CREATE TRIGGER live_apply_answer AFTER INSERT ON live_answers
BEGIN
  UPDATE live_players SET points = points + NEW.points,
    correct_count = correct_count + NEW.correct,
    correct_elapsed_ms = correct_elapsed_ms + NEW.correct * NEW.elapsed_ms
  WHERE game_id = NEW.game_id AND id = NEW.player_id;
END;
