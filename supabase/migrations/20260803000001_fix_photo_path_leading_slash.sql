-- profile_photo/banner_photo were stored as "uploads/..." (no leading slash) by the
-- upload handlers, while every mobile-side URL builder does `${API_URL}${path}` — with
-- no separator, this produced a mangled hostname (e.g. "blyssapp.fruploads/...") and the
-- image silently failed to load. The upload handlers now write "/uploads/..."; this
-- backfills existing rows so already-uploaded photos also display correctly.
UPDATE users
SET profile_photo = '/' || profile_photo
WHERE profile_photo IS NOT NULL
  AND profile_photo NOT LIKE '/%'
  AND profile_photo NOT LIKE 'http%';

UPDATE users
SET banner_photo = '/' || banner_photo
WHERE banner_photo IS NOT NULL
  AND banner_photo NOT LIKE '/%'
  AND banner_photo NOT LIKE 'http%';
