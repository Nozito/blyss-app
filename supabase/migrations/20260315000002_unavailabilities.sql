-- unavailabilities: pro can block date ranges (vacances, repos, etc.)
CREATE TABLE IF NOT EXISTS unavailabilities (
  id         SERIAL PRIMARY KEY,
  pro_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  reason     TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unavailabilities_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_unavailabilities_pro_id   ON unavailabilities(pro_id);
CREATE INDEX IF NOT EXISTS idx_unavailabilities_dates    ON unavailabilities(pro_id, start_date, end_date);
