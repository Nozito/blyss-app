/**
 * Payment cleanup cron — runs every 15 minutes.
 *
 * 1. Cancels reservations that remain unpaid for more than 30 minutes
 *    after creation and re-opens their slots.
 * 2. Expires the `payments` row left behind by an abandoned checkout
 *    (PaymentIntent created, never confirmed, Stripe never sends a
 *    payment_failed event because the client just walked away). Without
 *    this, the row stays 'pending' forever — and the unique index that
 *    guards against double-charging (uq_payments_reservation_type_active,
 *    scoped to pending/processing/succeeded) would then permanently block
 *    every future payment attempt on that reservation+type, since nothing
 *    ever moves the abandoned row out of 'pending'.
 *
 * This prevents both calendar slots and payment retries from being
 * permanently blocked by clients who started but never completed payment.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { getStripe } from "../lib/stripe";

const ROUTE = "/cron/payment-cleanup";
const UNPAID_TIMEOUT_MINUTES = 30;
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function cancelUnpaidReservations(): Promise<number> {
  const db = getDb();

  // Fetch all reservations that are confirmed but unpaid for too long
  const [rows] = await db.query(
    `SELECT id, slot_id
     FROM reservations
     WHERE payment_status = 'unpaid'
       AND status = 'confirmed'
       AND created_at < NOW() - MAKE_INTERVAL(mins => $1)`,
    [UNPAID_TIMEOUT_MINUTES]
  );

  const reservations = rows as Array<{ id: number; slot_id: number | null }>;
  if (reservations.length === 0) return 0;

  for (const r of reservations) {
    try {
      await db.execute(
        `UPDATE reservations
         SET status = 'cancelled', cancelled_by = 'system', updated_at = NOW()
         WHERE id = ?`,
        [r.id]
      );

      if (r.slot_id !== null) {
        await db.execute(
          `UPDATE slots SET status = 'available', updated_at = NOW()
           WHERE id = ? AND status = 'booked'`,
          [r.slot_id]
        );
      }

      log.warn(ROUTE, "Auto-cancelled unpaid reservation", { reservationId: r.id });
    } catch (err) {
      log.error(
        ROUTE,
        `Failed to cancel reservation ${r.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return reservations.length;
}

async function expireStalePendingPayments(): Promise<number> {
  const db = getDb();
  const stripe = getStripe();

  const [rows] = await db.query(
    `SELECT id, stripe_payment_intent_id
     FROM payments
     WHERE status = 'pending'
       AND stripe_payment_intent_id IS NOT NULL
       AND created_at < NOW() - MAKE_INTERVAL(mins => $1)`,
    [UNPAID_TIMEOUT_MINUTES]
  );

  const payments = rows as Array<{ id: number; stripe_payment_intent_id: string }>;
  if (payments.length === 0) return 0;

  let expired = 0;
  for (const payment of payments) {
    try {
      // Best-effort — the intent may already be canceled/succeeded at
      // Stripe (a webhook could land concurrently); either way, the
      // WHERE status='pending' guard below is what actually decides
      // whether this row transitions.
      await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id).catch(() => {});

      const [result] = await db.execute(
        `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = ? AND status = 'pending' RETURNING id`,
        [payment.id]
      );
      if ((result as any[]).length > 0) {
        expired++;
        log.warn(ROUTE, "Expired abandoned pending payment", { paymentId: payment.id });
      }
    } catch (err) {
      log.error(
        ROUTE,
        `Failed to expire payment ${payment.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return expired;
}

export async function runPaymentCleanup(): Promise<void> {
  try {
    const cancelled = await cancelUnpaidReservations();
    if (cancelled > 0) {
      log.warn(ROUTE, `Auto-cancelled ${cancelled} unpaid reservation(s)`);
    }
  } catch (err) {
    log.error(
      ROUTE,
      "Payment cleanup cycle failed",
      err instanceof Error ? err.stack : String(err)
    );
  }

  try {
    const expired = await expireStalePendingPayments();
    if (expired > 0) {
      log.warn(ROUTE, `Expired ${expired} abandoned pending payment(s)`);
    }
  } catch (err) {
    log.error(
      ROUTE,
      "Pending payment expiry cycle failed",
      err instanceof Error ? err.stack : String(err)
    );
  }
}

export function startPaymentCleanupCron(): void {
  // Initial run 2 minutes after startup
  setTimeout(() => {
    runPaymentCleanup().catch(() => {});
  }, 2 * 60 * 1000);

  setInterval(() => {
    runPaymentCleanup().catch(() => {});
  }, INTERVAL_MS);
}
