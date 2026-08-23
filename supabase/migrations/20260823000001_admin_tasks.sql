-- ============================================================
-- Migration : tâches internes admin (calendrier backoffice)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_tasks (
  id            SERIAL PRIMARY KEY,
  admin_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  color         TEXT NOT NULL DEFAULT 'blue'
    CHECK (color IN ('blue', 'green', 'purple', 'orange', 'pink', 'red')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_admin_start ON admin_tasks(admin_id, start_time);

-- Backend-only via service role (pattern identique à blocked_clients/waiting_list)
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
