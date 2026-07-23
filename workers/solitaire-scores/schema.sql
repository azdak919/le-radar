-- Run with: npx wrangler d1 execute le-radar-scores --remote --file=./schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) = 3),
  time_ms INTEGER NOT NULL CHECK(time_ms >= 10000 AND time_ms <= 28800000),
  moves INTEGER NOT NULL CHECK(moves >= 1 AND moves <= 10000),
  created_at INTEGER NOT NULL,
  UNIQUE(name, time_ms, moves)
);

CREATE INDEX IF NOT EXISTS scores_ranking ON scores(time_ms ASC, moves ASC, created_at ASC);

-- Hashes are only used to throttle submissions; raw addresses are never stored.
CREATE TABLE IF NOT EXISTS score_rate_limits (
  client_key TEXT PRIMARY KEY,
  submitted_at INTEGER NOT NULL
);
