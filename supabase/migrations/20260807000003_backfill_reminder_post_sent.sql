-- The post-appointment reminder cron (lib/reminders.ts, sendPostReminders) has
-- no time-window bound on `end_datetime` — by design, once a reservation is
-- flagged reminder_post_sent it's never reprocessed. But that means on its
-- very first run it would treat every pre-existing completed reservation as
-- "new" and blast the entire historical backlog at once. Backfill existing
-- rows as already-handled so only reservations that complete AFTER this
-- feature ships ever trigger the reminder.
UPDATE reservations SET reminder_post_sent = TRUE WHERE reminder_post_sent = FALSE;
