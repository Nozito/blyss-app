-- Idempotence table for Stripe webhook events.
-- Prevents a retried delivery (Stripe retries on any non-2xx or timeout)
-- from re-applying side effects (crediting total_paid twice, re-notifying, etc).

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     VARCHAR(255) PRIMARY KEY,
  event_type   VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
