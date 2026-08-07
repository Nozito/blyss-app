-- Track which completed reservations have already received the
-- post-appointment reminder (review + rebook nudge, Sérénité+ pros only)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reminder_post_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reservations_post_reminder
  ON reservations(status, end_datetime)
  WHERE reminder_post_sent = FALSE;
