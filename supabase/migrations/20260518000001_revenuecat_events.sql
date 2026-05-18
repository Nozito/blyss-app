-- Idempotence table for RevenueCat webhook events.
-- Prevents the same event from being processed more than once
-- even if RC retries the delivery.

CREATE TABLE IF NOT EXISTS revenuecat_events (
  event_id     VARCHAR(255) PRIMARY KEY,
  event_type   VARCHAR(100) NOT NULL,
  user_id      INTEGER      NOT NULL,
  processed_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_user_id ON revenuecat_events (user_id);
