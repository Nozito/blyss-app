-- Add acceptance_conditions column to users table (JSONB)
-- Stores structured booking conditions per pro (predefined keys, boolean values)
-- e.g. { "female_only": true, "home_visit": false, "new_clients": true }

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS acceptance_conditions JSONB;
