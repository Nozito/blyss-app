/**
 * Reschedule requests sweep cron — runs every 15 minutes.
 *
 * Marks `reschedule_requests` rows that are still 'pending' but past their
 * `expires_at` as 'expired'. Purely a cleanup pass: it never touches the
 * underlying `reservations` row, which stays exactly as it was until a
 * client explicitly accepts a proposal (see reschedule.service.ts).
 *
 * Idempotent: the UPDATE is scoped to `status = 'pending'`, so a request
 * already accepted/declined/expired by a concurrent request (e.g. the
 * client accepted seconds before this cron ran) is never overwritten —
 * same guard as the one used in reschedule.service.ts's own accept/decline
 * paths, applied here to close the last gap: a request nobody ever opens
 * would otherwise stay 'pending' forever, silently blocking the unique
 * partial index that guarantees one active proposal per reservation.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/reschedule-sweep";
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export async function sweepExpiredRescheduleRequests(): Promise<number> {
  const db = getDb();

  const [rows] = await db.execute(
    `UPDATE reschedule_requests
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id`
  );

  const expired = rows as Array<{ id: number }>;
  if (expired.length > 0) {
    // IDs et horodatage uniquement — aucune donnée personnelle (pas de nom,
    // pas de créneau, pas de motif de report) dans ce log.
    log.warn(ROUTE, `Expired ${expired.length} stale reschedule request(s)`, {
      requestIds: expired.map((r) => r.id),
    });
  }
  return expired.length;
}

export async function runRescheduleSweep(): Promise<void> {
  try {
    await sweepExpiredRescheduleRequests();
  } catch (err) {
    log.error(
      ROUTE,
      "Reschedule sweep cycle failed",
      err instanceof Error ? err.stack : String(err)
    );
  }
}

export function startRescheduleSweepCron(): void {
  setTimeout(() => {
    runRescheduleSweep().catch(() => {});
  }, 2 * 60 * 1000);

  setInterval(() => {
    runRescheduleSweep().catch(() => {});
  }, INTERVAL_MS);
}
