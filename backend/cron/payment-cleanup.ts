/**
 * Payment cleanup cron — runs every 15 minutes.
 *
 * Cancels reservations that remain unpaid for more than 30 minutes
 * after creation and re-opens their slots.
 *
 * This prevents calendar slots from being permanently blocked by
 * clients who started but never completed payment.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

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
