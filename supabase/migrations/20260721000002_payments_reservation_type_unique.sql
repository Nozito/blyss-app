-- Prevents two concurrent create-intent requests (double-tap, retry) from
-- both passing the application-level "not already paid" check and each
-- creating a separate Stripe PaymentIntent for the same reservation+type.
-- Only one non-terminal (pending/processing/succeeded) payment row is
-- allowed per (reservation_id, type) at a time; failed/refunded rows don't
-- count, so a legitimate retry after a failure can still create a new one.

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reservation_type_active
  ON payments (reservation_id, type)
  WHERE status IN ('pending', 'processing', 'succeeded');
