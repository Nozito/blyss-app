-- Admin's "Avis signalés" moderation screen (app/(admin-tools)/reviews.tsx)
-- has been fully built client-side for a while, but nothing backs it: no
-- flagging concept existed anywhere in the schema, and none of
-- GET/DELETE/ignore-flag had a matching backend route. flags_count on the
-- mobile screen implies multiple distinct reporters per review, hence a
-- join table rather than a single boolean on reviews.
CREATE TABLE IF NOT EXISTS review_flags (
  id          SERIAL PRIMARY KEY,
  review_id   INT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  flagged_by  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, flagged_by)
);

CREATE INDEX IF NOT EXISTS idx_review_flags_review ON review_flags(review_id);
