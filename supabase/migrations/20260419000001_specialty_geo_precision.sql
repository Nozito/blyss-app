-- Add specialty column to pro profiles (replaces hardcoded string in queries)
-- Add geo_precision to distinguish exact-address pins from city-center pins on the map
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS specialty TEXT,
  ADD COLUMN IF NOT EXISTS geo_precision TEXT DEFAULT 'city'
    CHECK (geo_precision IN ('address', 'city'));

-- Index for specialty search
CREATE INDEX IF NOT EXISTS idx_users_specialty ON users(specialty) WHERE specialty IS NOT NULL;
