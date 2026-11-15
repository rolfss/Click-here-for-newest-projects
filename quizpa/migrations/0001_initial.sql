CREATE TABLE quizzes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  questions TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE rounds (
  code TEXT PRIMARY KEY NOT NULL,
  source_quiz TEXT REFERENCES quizzes(id),
  source_revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  questions TEXT NOT NULL,
  opens_at INTEGER NOT NULL,
  closes_at INTEGER,
  closed_at INTEGER,
  feedback_mode TEXT NOT NULL CHECK (feedback_mode IN ('immediate', 'after_close')),
  board_mode TEXT NOT NULL CHECK (board_mode IN ('always', 'after_close', 'hidden')),
  created_at INTEGER NOT NULL
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY NOT NULL,
  round_code TEXT NOT NULL REFERENCES rounds(code),
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  UNIQUE (round_code, nickname_key),
  UNIQUE (round_code, access_hash)
);

CREATE INDEX attempts_ranking
  ON attempts (round_code, points DESC, correct_count DESC, elapsed_ms, nickname_key)
  WHERE completed_at IS NOT NULL;

CREATE TABLE question_runs (
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  position INTEGER NOT NULL,
  option_order TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, position)
);

CREATE TABLE answers (
  attempt_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  selected INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'wrong', 'skip', 'timeout')),
  points INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  is_last INTEGER NOT NULL CHECK (is_last IN (0, 1)),
  PRIMARY KEY (attempt_id, position),
  FOREIGN KEY (attempt_id, position) REFERENCES question_runs(attempt_id, position)
);

CREATE TRIGGER apply_answer AFTER INSERT ON answers
BEGIN
  UPDATE attempts SET position = position + 1,
    points = points + NEW.points,
    correct_count = correct_count + (NEW.outcome = 'correct'),
    elapsed_ms = elapsed_ms + NEW.elapsed_ms,
    completed_at = CASE WHEN NEW.is_last = 1 THEN NEW.submitted_at ELSE completed_at END
  WHERE id = NEW.attempt_id AND position = NEW.position AND completed_at IS NULL;
END;

CREATE TABLE organizer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL
);

CREATE TABLE login_limits (
  key TEXT PRIMARY KEY NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
