-- Track which reservations have already received push reminders
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reminder_j1_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_h2_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reservations_reminders
  ON reservations(status, start_datetime)
  WHERE reminder_j1_sent = FALSE OR reminder_h2_sent = FALSE;
