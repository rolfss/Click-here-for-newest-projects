CREATE TABLE join_codes (
  code TEXT PRIMARY KEY NOT NULL,
  round_code TEXT NOT NULL REFERENCES rounds(code),
  period INTEGER NOT NULL,
  UNIQUE (round_code, period)
);

CREATE INDEX join_codes_period ON join_codes(period);
