-- Drop the Instagram OAuth photo-import feature entirely (backend routes,
-- InstagramService, and this schema removed together — 2026-08-06). Not
-- needed for V1; portfolio photos are now covered by the manual gallery
-- (gallery_images table) instead.

DROP TABLE IF EXISTS instagram_sync_log;
DROP TABLE IF EXISTS instagram_media_cache;
DROP TABLE IF EXISTS instagram_connections;
