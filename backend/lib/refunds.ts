/**
 * Refund helpers — initiate Stripe refunds for all succeeded payments
 * on a reservation and update the payments table accordingly.
 *
 * Designed to be called from cancellation routes (client or pro).
 * Each payment is refunded independently in its own transaction; a single
 * failure does not abort the others (best-effort with full logging).
 *
 * Concurrency: right before calling Stripe, each payment row is re-selected
 * with `FOR UPDATE` inside its own transaction. A second concurrent call
 * (double-tap on cancel, a client retry after a slow/timed-out response)
 * either blocks until the first transaction commits (then sees
 * stripe_refund_id already set and skips), or finds zero matching rows if
 * the first call already committed — either way it can no longer read a
 * stale "not yet refunded" state and refund the same payment twice.
 */

import { getDb } from "./db";
import { log } from "./logger";
import { getStripe } from "./stripe";
import { sendAlert } from "./alerts";

export interface RefundResult {
  /** true if at least one refund was initiated */
  refunded: boolean;
  /** total amount refunded in € */
  totalRefunded: number;
  refunds: Array<{ paymentId: number; stripeRefundId: string; amount: number }>;
  errors: number;
}

/** Sends a critical alert when a Stripe refund succeeded but the DB write recording it failed. */
async function alertReconciliationNeeded(
  route: string,
  context: { reservationId?: number; paymentId: number; stripeRefundId: string; amount: number }
): Promise<void> {
  await sendAlert(
    "critical",
    "Refund succeeded at Stripe but DB write failed — manual reconciliation needed",
    context
  ).catch(() => {});
  log.error(route, `Refund ${context.stripeRefundId} succeeded at Stripe but DB update failed`, JSON.stringify(context));
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

  // Enumerate candidates without holding a lock — each one is re-validated
  // with FOR UPDATE in its own transaction right before it's refunded.
  const [rows] = await db.query(
    `SELECT id
     FROM payments
     WHERE reservation_id = ?
       AND status = 'succeeded'
       AND stripe_payment_intent_id IS NOT NULL
       AND stripe_refund_id IS NULL
       AND type IN ('balance', 'full')`,
    [reservationId]
  );
  const candidateIds = (rows as Array<{ id: number }>).map((r) => r.id);

  if (candidateIds.length === 0) {
    return { refunded: false, totalRefunded: 0, refunds: [], errors: 0 };
  }

  let totalRefunded = 0;
  let errors = 0;
  const refunds: RefundResult["refunds"] = [];

  for (const paymentId of candidateIds) {
    const connection = await db.getConnection();
    let stripeRefundId: string | null = null;
    let refundAmount = 0;
    try {
      await connection.beginTransaction();

      const [lockedRows] = await connection.query(
        `SELECT id, stripe_payment_intent_id, amount, type
         FROM payments
         WHERE id = ?
           AND status = 'succeeded'
           AND stripe_refund_id IS NULL
         FOR UPDATE`,
        [paymentId]
      );
      const payment = (lockedRows as Array<{
        id: number;
        stripe_payment_intent_id: string;
        amount: string | number;
        type: string;
      }>)[0];

      if (!payment) {
        // Already refunded (or claimed) by a concurrent call — nothing to do.
        await connection.commit();
        continue;
      }

      const paidAmount = Number(payment.amount);
      refundAmount = paidAmount;
      if (payment.type === "full" && depositAmount && depositAmount > 0) {
        refundAmount = paidAmount - Number(depositAmount);
        if (refundAmount <= 0) {
          await connection.commit();
          continue; // Deposit covers everything → nothing to refund
        }
      }

      const amountCents = Math.round(refundAmount * 100);

      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: amountCents,
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;

      await connection.execute(
        `UPDATE payments
         SET status = 'refunded',
             stripe_refund_id = ?,
             refund_amount = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [refund.id, refundAmount, payment.id]
      );

      await connection.commit();

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
      await connection.rollback().catch(() => {});
      if (stripeRefundId) {
        await alertReconciliationNeeded("refunds/client-cancel", {
          reservationId,
          paymentId,
          stripeRefundId,
          amount: refundAmount,
        });
      } else {
        log.error(
          "refunds/client-cancel",
          `Failed to refund payment ${paymentId}`,
          err instanceof Error ? err.stack : String(err)
        );
      }
    } finally {
      connection.release();
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
    `SELECT id
     FROM payments
     WHERE reservation_id = ?
       AND status = 'succeeded'
       AND stripe_payment_intent_id IS NOT NULL
       AND stripe_refund_id IS NULL`,
    [reservationId]
  );
  const candidateIds = (rows as Array<{ id: number }>).map((r) => r.id);

  if (candidateIds.length === 0) {
    return { refunded: false, totalRefunded: 0, refunds: [], errors: 0 };
  }

  let totalRefunded = 0;
  let errors = 0;
  const refunds: RefundResult["refunds"] = [];

  for (const paymentId of candidateIds) {
    const connection = await db.getConnection();
    let stripeRefundId: string | null = null;
    let amount = 0;
    try {
      await connection.beginTransaction();

      const [lockedRows] = await connection.query(
        `SELECT id, stripe_payment_intent_id, amount
         FROM payments
         WHERE id = ?
           AND status = 'succeeded'
           AND stripe_refund_id IS NULL
         FOR UPDATE`,
        [paymentId]
      );
      const payment = (lockedRows as Array<{
        id: number;
        stripe_payment_intent_id: string;
        amount: string | number;
      }>)[0];

      if (!payment) {
        // Already refunded (or claimed) by a concurrent call — nothing to do.
        await connection.commit();
        continue;
      }

      amount = Number(payment.amount);

      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        reason,
      });
      stripeRefundId = refund.id;

      await connection.execute(
        `UPDATE payments
         SET status = 'refunded',
             stripe_refund_id = ?,
             refund_amount = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [refund.id, amount, payment.id]
      );

      await connection.commit();

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
      await connection.rollback().catch(() => {});
      if (stripeRefundId) {
        await alertReconciliationNeeded("refunds/initiate", {
          reservationId,
          paymentId,
          stripeRefundId,
          amount,
        });
      } else {
        log.error(
          "refunds/initiate",
          `Failed to refund payment ${paymentId} for reservation ${reservationId}`,
          err instanceof Error ? err.stack : String(err)
        );
      }
    } finally {
      connection.release();
    }
  }

  return { refunded: refunds.length > 0, totalRefunded, refunds, errors };
}

export type RefundPaymentOutcome =
  | { status: "refunded"; stripeRefundId: string; amount: number }
  | { status: "not_found" }
  | { status: "already_refunded" }
  | { status: "not_refundable" };

/**
 * Refunds a single payment by id (admin action). Same locking pattern as
 * the reservation-scoped helpers above: the row is re-selected with
 * `FOR UPDATE` inside a transaction right before calling Stripe, so a
 * double-click can't refund the same payment twice.
 */
export async function refundPaymentById(
  paymentId: number,
  reason: "duplicate" | "fraudulent" | "requested_by_customer" = "requested_by_customer"
): Promise<RefundPaymentOutcome> {
  const db = getDb();
  const stripe = getStripe();
  const connection = await db.getConnection();

  let stripeRefundId: string | null = null;
  let amount = 0;
  let reservationId: number | undefined;

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, reservation_id, status, stripe_payment_intent_id, amount
       FROM payments
       WHERE id = ?
       FOR UPDATE`,
      [paymentId]
    );
    const payment = (rows as Array<{
      id: number;
      reservation_id: number;
      status: string;
      stripe_payment_intent_id: string | null;
      amount: string | number;
    }>)[0];

    if (!payment) {
      await connection.commit();
      return { status: "not_found" };
    }
    reservationId = payment.reservation_id;

    if (payment.status === "refunded") {
      await connection.commit();
      return { status: "already_refunded" };
    }
    if (payment.status !== "succeeded" || !payment.stripe_payment_intent_id) {
      await connection.commit();
      return { status: "not_refundable" };
    }

    amount = Number(payment.amount);

    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      reason,
    });
    stripeRefundId = refund.id;

    await connection.execute(
      `UPDATE payments
       SET status = 'refunded', stripe_refund_id = ?, refund_amount = ?, updated_at = NOW()
       WHERE id = ?`,
      [refund.id, amount, paymentId]
    );

    await connection.commit();

    log.warn("refunds/admin", "Admin-initiated refund succeeded", { paymentId, stripeRefundId: refund.id, amount });
    return { status: "refunded", stripeRefundId: refund.id, amount };
  } catch (err) {
    await connection.rollback().catch(() => {});
    if (stripeRefundId) {
      await alertReconciliationNeeded("refunds/admin", { reservationId, paymentId, stripeRefundId, amount });
    } else {
      log.error(
        "refunds/admin",
        `Admin-initiated refund failed for payment ${paymentId}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
    throw err;
  } finally {
    connection.release();
  }
}
