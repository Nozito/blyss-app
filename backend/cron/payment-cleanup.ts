/**
 * Payment cleanup cron — runs every 15 minutes.
 *
 * 1. Cancels reservations that remain unpaid for more than 30 minutes
 *    after creation. La capacité est rendue au moteur de dispo automatiquement.
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
import { sendAlert } from "../lib/alerts";
import { initiateRefundsForReservation } from "../lib/refunds";

const ROUTE = "/cron/payment-cleanup";
const UNPAID_TIMEOUT_MINUTES = 30;
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Statuts Stripe qui signifient "un paiement est en cours ou abouti" : on ne
// doit PAS annuler la réservation tant que le PaymentIntent est dans un de
// ces états — le webhook (ou un cycle suivant) tranchera.
const PI_IN_FLIGHT = new Set([
  "succeeded",
  "processing",
  "requires_capture",
  "requires_action",
  "requires_confirmation",
]);

async function cancelUnpaidReservations(): Promise<number> {
  const db = getDb();
  const stripe = getStripe();

  // Fetch all online-payment reservations still unpaid for too long. These
  // sit in 'pending' (never confirmed without payment) — older rows created
  // before that change may still be 'confirmed'; both are swept here.
  // paid_online = FALSE excludes pay-on-site bookings: those also start
  // out with payment_status='unpaid' (nothing is charged at booking time,
  // the pro only marks them paid_on_site the day of service) — without
  // this filter, every pay-on-site reservation was silently auto-cancelled
  // 30 minutes after being made, which is not the intent of this cron
  // (it exists to catch abandoned online-checkout attempts, not on-site
  // bookings that were never supposed to be paid up front).
  //
  // On récupère aussi le dernier PaymentIntent connu : avant d'annuler, on
  // vérifie chez Stripe qu'aucun paiement n'est en cours/abouti — sinon on
  // laisse la réservation tranquille (le webhook la confirmera, ou un cycle
  // suivant l'annulera si le paiement échoue vraiment).
  const [rows] = await db.query(
    `SELECT r.id,
            (SELECT p.stripe_payment_intent_id
             FROM payments p
             WHERE p.reservation_id = r.id AND p.stripe_payment_intent_id IS NOT NULL
             ORDER BY p.created_at DESC
             LIMIT 1) AS last_pi
     FROM reservations r
     WHERE r.payment_status = 'unpaid'
       AND r.status IN ('pending', 'confirmed')
       AND r.paid_online = TRUE
       AND r.created_at < NOW() - MAKE_INTERVAL(mins => $1)`,
    [UNPAID_TIMEOUT_MINUTES]
  );

  const reservations = rows as Array<{ id: number; last_pi: string | null }>;
  if (reservations.length === 0) return 0;

  let cancelled = 0;
  for (const r of reservations) {
    try {
      if (r.last_pi) {
        let piStatus: string | null = null;
        try {
          const pi = await stripe.paymentIntents.retrieve(r.last_pi);
          piStatus = pi.status;
        } catch (err) {
          // PI introuvable / erreur transitoire — on préfère NE PAS annuler
          // ce cycle-ci et retenter au suivant plutôt que risquer d'annuler
          // une réservation dont le paiement aboutit.
          log.warn(ROUTE, "Could not retrieve PaymentIntent — skipping cancel this cycle", {
            reservationId: r.id,
          });
          continue;
        }
        if (piStatus && PI_IN_FLIGHT.has(piStatus)) {
          log.warn(ROUTE, "Payment in flight — not cancelling reservation", {
            reservationId: r.id,
            piStatus,
          });
          continue;
        }
      }

      await db.execute(
        `UPDATE reservations
         SET status = 'cancelled', cancelled_by = 'system', updated_at = NOW()
         WHERE id = ? AND status IN ('pending', 'confirmed')`,
        [r.id]
      );
      cancelled++;
      log.warn(ROUTE, "Auto-cancelled unpaid reservation", { reservationId: r.id });
    } catch (err) {
      log.error(
        ROUTE,
        `Failed to cancel reservation ${r.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return cancelled;
}

/**
 * Filet de sécurité pour la race cron↔webhook : une réservation annulée
 * (timeout, annulation) dont un paiement a malgré tout abouti ensuite. Le
 * webhook `payment_intent.succeeded` déclenche déjà un remboursement auto,
 * mais s'il n'a pas pu (process tué juste après le commit, event non rejoué
 * car déjà dans `stripe_events`), cette passe le rattrape.
 *
 * `initiateRefundsForReservation` est idempotent (`stripe_refund_id IS NULL`
 * + verrou `FOR UPDATE`) : sans effet si le remboursement a déjà eu lieu.
 */
async function refundCancelledButPaid(): Promise<number> {
  const db = getDb();

  const [rows] = await db.query(
    `SELECT DISTINCT p.reservation_id
     FROM payments p
     JOIN reservations r ON r.id = p.reservation_id
     WHERE p.status = 'succeeded'
       AND p.stripe_payment_intent_id IS NOT NULL
       AND p.stripe_refund_id IS NULL
       AND r.status = 'cancelled'`
  );
  const reservationIds = (rows as Array<{ reservation_id: number }>).map((x) => x.reservation_id);
  if (reservationIds.length === 0) return 0;

  let refunded = 0;
  for (const reservationId of reservationIds) {
    try {
      await sendAlert("critical", "Réservation annulée avec un paiement encaissé — remboursement de rattrapage", {
        reservationId,
        source: "payment-cleanup/reconcile",
      }).catch(() => {});
      const rr = await initiateRefundsForReservation(reservationId, "requested_by_customer");
      if (rr.refunded) refunded++;
      log.warn(ROUTE, "Reconcile refund", {
        reservationId,
        refunded: rr.refunded,
        totalRefunded: rr.totalRefunded,
        errors: rr.errors,
      });
    } catch (err) {
      log.error(
        ROUTE,
        `Reconcile refund failed for reservation ${reservationId}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }
  return refunded;
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

  try {
    const refunded = await refundCancelledButPaid();
    if (refunded > 0) {
      log.warn(ROUTE, `Reconciled ${refunded} cancelled-but-paid reservation(s)`);
    }
  } catch (err) {
    log.error(
      ROUTE,
      "Cancelled-but-paid reconcile cycle failed",
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
