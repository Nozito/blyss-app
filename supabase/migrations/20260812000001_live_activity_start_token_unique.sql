-- live_activity_tokens' original UNIQUE (user_id, kind, activity_id) never
-- actually enforced uniqueness for 'start' tokens: activity_id is always
-- NULL for that kind (device-level, not tied to one activity — see comment
-- on the column), and Postgres treats every NULL as distinct for uniqueness
-- purposes. Each push-to-start-token registration (potentially every app
-- launch) therefore inserted a new row instead of upserting the existing
-- one, and POST /api/pro/live-activity/tokens' `ON CONFLICT (user_id, kind,
-- activity_id)` had no matching arbiter index to trigger on for these rows.
-- Accumulated duplicates then produced redundant/stale APNs push-to-start
-- sends from the reminder cron's JOIN against this table.
--
-- A partial unique index scoped to kind = 'start' gives Postgres a real
-- constraint to upsert against for that kind, while the original composite
-- UNIQUE stays correct and untouched for 'update' rows (activity_id is
-- always non-null there).
CREATE UNIQUE INDEX IF NOT EXISTS live_activity_tokens_start_unique
  ON live_activity_tokens (user_id)
  WHERE kind = 'start';

-- One-time cleanup of rows accumulated under the old, non-enforcing
-- constraint — keep only the most recently updated 'start' token per user.
DELETE FROM live_activity_tokens a
USING live_activity_tokens b
WHERE a.kind = 'start'
  AND b.kind = 'start'
  AND a.user_id = b.user_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);
