-- ============================================================
-- Migration : refund tracking + cancellation actor
-- ============================================================

-- 1. Track who cancelled a reservation (client, pro, or system timeout)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('client', 'pro', 'system'));

-- 2. Track Stripe refund details on payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refund_amount    NUMERIC(10,2);
