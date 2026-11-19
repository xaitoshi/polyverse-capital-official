-- Polyverse tennis book. Picks and grades are insert-only.

CREATE TABLE IF NOT EXISTS tennis_matches (
  id TEXT PRIMARY KEY,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tennis_matches_start_idx ON tennis_matches (start_time);

-- Immutable. The cron inserts with ON CONFLICT DO NOTHING and a start_time guard.
CREATE TABLE IF NOT EXISTS tennis_picks (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  picked_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

-- First settlement wins. Voids and winners are not rewritten.
CREATE TABLE IF NOT EXISTS tennis_results (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  settled_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
