-- Live Activity phase transitions were only ever pushed remotely for the
-- "start" event (manageLiveActivities, 3h before). Nothing pushed an update
-- at the appointment's actual start time (upcoming -> in progress) or end
-- time (in progress -> ended) when the pro's app was backgrounded — the
-- phase label only ever recomputed correctly when *something else*
-- happened to trigger a re-render (foreground polling, or an unrelated
-- reservation mutation). This column lets a new cron job push the
-- start-time transition exactly once, the same idempotency pattern as
-- live_activity_started.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS live_activity_inprogress_pushed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reservations_live_activity_inprogress
  ON reservations(status, start_datetime)
  WHERE live_activity_started = TRUE AND live_activity_inprogress_pushed = FALSE;
