-- Live RDV: iOS Live Activity (lock screen + Dynamic Island) for pros'
-- next confirmed appointment. iOS-only feature.

CREATE TABLE IF NOT EXISTS live_activity_tokens (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('start', 'update')),
  activity_id    TEXT,                 -- NULL for a 'start' token (device-level, not tied to one activity)
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE CASCADE,
  push_token     TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_live_activity_tokens_user ON live_activity_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_live_activity_tokens_reservation ON live_activity_tokens(reservation_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS live_activity_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS live_activity_privacy TEXT NOT NULL DEFAULT 'full'
    CHECK (live_activity_privacy IN ('full', 'time_only', 'countdown_only'));

-- Tracks whether a push-to-start has already been sent for a given
-- reservation, so the cron doesn't re-trigger it every cycle (same
-- idempotency pattern as reminder_h2_sent).
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS live_activity_started BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reservations_live_activity
  ON reservations(status, start_datetime)
  WHERE live_activity_started = FALSE;
