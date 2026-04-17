/**
 * Refund helpers — initiate Stripe refunds for all succeeded payments
 * on a reservation and update the payments table accordingly.
 *
 * Designed to be called from cancellation routes (client or pro).
 * Each payment is refunded independently; a single failure does not abort
 * the others (best-effort with full logging).
 */

import { getDb } from "./db";
import { log } from "./logger";
import { getStripe } from "./stripe";

export interface RefundResult {
  /** true if at least one refund was initiated */
  refunded: boolean;
  /** total amount refunded in € */
  totalRefunded: number;
  refunds: Array<{ paymentId: number; stripeRefundId: string; amount: number }>;
  errors: number;
}

/**
 * Client-initiated cancellation refund policy:
 * - Deposit payments (type='deposit') → NOT refunded (kept by pro as compensation)
 * - Balance payments (type='balance')  → fully refunded
 * - Full payments (type='full')        → partially refunded: amount - deposit_amount
 *
 * Never touches on_site payments (no Stripe record to refund).
 */
export async function initiateClientCancellationRefunds(
  reservationId: number,
  depositAmount: number | null
): Promise<RefundResult> {
  const db = getDb();
  const stripe = getStripe();

  // Fetch succeeded online payments — exclude deposit-type (non-refundable)
  const [rows] = await db.query(
    `SELECT id, stripe_payment_intent_id, amount, type
     FROM payments
     WHERE reservation_id = ?
       AND status = 'succeeded'
       AND stripe_payment_intent_id IS NOT NULL
       AND stripe_refund_id IS NULL
       AND type IN ('balance', 'full')`,
    [reservationId]
  );

  const payments = rows as Array<{
    id: number;
    stripe_payment_intent_id: string;
    amount: string | number;
    type: string;
  }>;

  if (payments.length === 0) {
    return { refunded: false, totalRefunded: 0, refunds: [], errors: 0 };
  }

  let totalRefunded = 0;
  let errors = 0;
  const refunds: RefundResult["refunds"] = [];

  for (const payment of payments) {
    try {
      const paidAmount = Number(payment.amount);

      // For 'full' payments: refund only the non-deposit portion
      let refundAmount = paidAmount;
      if (payment.type === "full" && depositAmount && depositAmount > 0) {
        refundAmount = paidAmount - Number(depositAmount);
        if (refundAmount <= 0) continue; // Deposit covers everything → nothing to refund
      }

      const amountCents = Math.round(refundAmount * 100);

      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: amountCents,
        reason: "requested_by_customer",
      });

      await db.execute(
        `UPDATE payments
         SET status = 'refunded',
             stripe_refund_id = ?,
             refund_amount = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [refund.id, refundAmount, payment.id]
      );

      totalRefunded += refundAmount;
      refunds.push({ paymentId: payment.id, stripeRefundId: refund.id, amount: refundAmount });

      log.warn("refunds/client-cancel", "Partial/balance refund initiated", {
        reservationId,
        paymentId: payment.id,
        type: payment.type,
        refundAmount,
      });
    } catch (err) {
      errors++;
      log.error(
        "refunds/client-cancel",
        `Failed to refund payment ${payment.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return { refunded: refunds.length > 0, totalRefunded, refunds, errors };
}

/**
 * Initiate Stripe refunds for all succeeded online payments on a reservation.
 * Updates each payment row with stripe_refund_id + refund_amount + status='refunded'.
 *
 * Safe to call even if no payments exist (returns { refunded: false, ... }).
 */
export async function initiateRefundsForReservation(
  reservationId: number,
  reason: "duplicate" | "fraudulent" | "requested_by_customer" = "requested_by_customer"
): Promise<RefundResult> {
  const db = getDb();
  const stripe = getStripe();

  const [rows] = await db.query(
    `SELECT id, stripe_payment_intent_id, amount
     FROM payments
     WHERE reservation_id = ?
       AND status = 'succeeded'
       AND stripe_payment_intent_id IS NOT NULL
       AND stripe_refund_id IS NULL`,
    [reservationId]
  );

  const payments = rows as Array<{
    id: number;
    stripe_payment_intent_id: string;
    amount: string | number;
  }>;

  if (payments.length === 0) {
    return { refunded: false, totalRefunded: 0, refunds: [], errors: 0 };
  }

  let totalRefunded = 0;
  let errors = 0;
  const refunds: RefundResult["refunds"] = [];

  for (const payment of payments) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        reason,
      });

      const amount = Number(payment.amount);

      await db.execute(
        `UPDATE payments
         SET status = 'refunded',
             stripe_refund_id = ?,
             refund_amount = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [refund.id, amount, payment.id]
      );

      totalRefunded += amount;
      refunds.push({ paymentId: payment.id, stripeRefundId: refund.id, amount });

      log.warn("refunds/initiate", "Refund initiated", {
        reservationId,
        paymentId: payment.id,
        stripeRefundId: refund.id,
        amount,
      });
    } catch (err) {
      errors++;
      log.error(
        "refunds/initiate",
        `Failed to refund payment ${payment.id} for reservation ${reservationId}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return { refunded: refunds.length > 0, totalRefunded, refunds, errors };
}
