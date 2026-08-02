-- Address privacy: pros can keep their exact address hidden from public view.
-- `geo_precision` already exists (20260419000001) and defaults to 'city' (safe default);
-- it is now the single source of truth for the visibility toggle:
--   'city'    -> address hidden, public map/search only ever see an approximate point
--   'address' -> pro opted in, exact address + precise pin are public
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address_line TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS public_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS public_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(4,1) NOT NULL DEFAULT 5.0
    CHECK (service_radius_km BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS service_area_label TEXT;

-- Backfill an approximate public point for existing pros so the public list/search
-- endpoints never fall back to the exact coordinates while this column is empty.
-- This is a coarse, deterministic offset (id-based, bounded ~0.9km); it gets replaced
-- by the cryptographic jitter (lib/geocoding.ts#jitterCoords) on the pro's next save.
UPDATE users
SET
  public_latitude = latitude + (((id % 41) - 20) / 20.0) * 0.008,
  public_longitude = longitude + (((id % 37) - 18) / 18.0) * 0.008
WHERE role = 'pro' AND latitude IS NOT NULL AND longitude IS NOT NULL AND public_latitude IS NULL;
