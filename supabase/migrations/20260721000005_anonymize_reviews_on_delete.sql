-- DELETE /api/auth/delete-account anonymizes reservations and payments
-- before removing the user, but reviews were left untouched — client_id and
-- pro_id are NOT NULL with no ON DELETE CASCADE, so any user with a review
-- (wrote one, or was reviewed) would still hit a FK violation and fail to
-- delete their account. Product decision: anonymize reviews (keep the
-- rating/comment content, drop the author/subject attribution) rather than
-- delete them outright.

ALTER TABLE reviews ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE reviews ALTER COLUMN pro_id DROP NOT NULL;
