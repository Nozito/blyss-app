-- RGPD data-retention: missing columns for cron/data-retention.ts

-- 1. reservations.notes — free-text note from client/pro, must be anonymised after 5 years
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- client_id must be nullable so RGPD anonymisation can set it to NULL (5-year rule)
ALTER TABLE reservations
  ALTER COLUMN client_id DROP NOT NULL;

-- 2. users.last_login_at — needed for inactivity-based account deletion (3-year rule)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. users.retention_notice_sent_at — records when the 30-day deletion notice was sent
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS retention_notice_sent_at TIMESTAMPTZ;

-- Index for efficient inactivity queries
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login_at)
  WHERE last_login_at IS NOT NULL;
