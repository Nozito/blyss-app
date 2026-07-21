/**
 * Admin-granted subscription expiry cron — runs hourly.
 *
 * Admin-granted subscriptions (payment_id='admin_grant', via the "offrir un
 * abonnement" admin panel action) have a real end_date but nothing else
 * expires them — unlike RevenueCat-driven subscriptions, which get an
 * EXPIRATION/CANCELLATION webhook automatically. Without this cron, an
 * admin grant stays pro_status='active' forever once its end_date passes.
 *
 * Scoped to payment_id='admin_grant' only — RevenueCat-driven subscriptions
 * are left entirely to the webhook, so this cron can't race or conflict
 * with it.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/subscription-expiry";
const INTERVAL_MS = 60 * 60 * 1000; // 1 heure

async function expireAdminGrants(): Promise<number> {
  const db = getDb();

  const [rows] = await db.query(
    `SELECT id, client_id
     FROM subscriptions
     WHERE payment_id = 'admin_grant'
       AND status = 'active'
       AND end_date IS NOT NULL
       AND end_date < CURRENT_DATE`
  );

  const expired = rows as Array<{ id: number; client_id: number }>;
  if (expired.length === 0) return 0;

  for (const sub of expired) {
    try {
      await db.execute(
        `UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [sub.id]
      );
      // Only downgrade if nothing more recent (e.g. a real RC purchase since
      // the grant) has already superseded this as the active subscription —
      // re-check there's no other active row for this user before touching
      // pro_status.
      const [stillActiveRows] = await db.query(
        `SELECT id FROM subscriptions WHERE client_id = ? AND status = 'active' LIMIT 1`,
        [sub.client_id]
      );
      if ((stillActiveRows as any[]).length === 0) {
        await db.execute(`UPDATE users SET pro_status = 'inactive' WHERE id = ?`, [sub.client_id]);
      }
      log.warn(ROUTE, "Expired admin-granted subscription", { subscriptionId: sub.id, userId: sub.client_id });
    } catch (err) {
      log.error(
        ROUTE,
        `Failed to expire subscription ${sub.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  return expired.length;
}

export async function runSubscriptionExpiryCheck(): Promise<void> {
  try {
    const count = await expireAdminGrants();
    if (count > 0) {
      log.warn(ROUTE, `Expired ${count} admin-granted subscription(s)`);
    }
  } catch (err) {
    log.error(ROUTE, "Subscription expiry cycle failed", err instanceof Error ? err.stack : String(err));
  }
}

export function startSubscriptionExpiryCron(): void {
  setTimeout(() => {
    runSubscriptionExpiryCheck().catch(() => {});
  }, 2 * 60 * 1000);

  setInterval(() => {
    runSubscriptionExpiryCheck().catch(() => {});
  }, INTERVAL_MS);
}
