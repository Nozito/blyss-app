-- Add geolocation columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Index for bounding-box queries (fast radius search)
CREATE INDEX IF NOT EXISTS idx_users_geo
  ON users (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
