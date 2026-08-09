-- Migration : reviews_soft_delete
-- Date : 2026-08-09T00:00:03.000Z
--
-- Admin review deletion becomes a soft delete so it can be undone
-- ("remettre l'avis") and so the pro can be notified either way.

ALTER TABLE reviews ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_reviews_deleted_at ON reviews(deleted_at) WHERE deleted_at IS NOT NULL;
