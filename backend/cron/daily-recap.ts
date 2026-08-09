/**
 * Pro daily recap crons — checked every 15 minutes, fire once per pro per day:
 *   - ~8h Europe/Paris : "daily_reminder" — récap des RDV du jour
 *   - ~19h Europe/Paris : "activity_summary" — CA + nombre de RDV du jour
 *
 * Idempotent via a NOT EXISTS guard on today's notifications for that
 * (user_id, type) pair — a re-run in the same window is a no-op.
 *
 * Notifies via Expo push (reaches the app in background/closed) + an
 * in-app notification row, same pattern as cron/recall.ts.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { getRevenueStats } from "../lib/finance";
import { sendExpoPushToUsers } from "../lib/push";

const ROUTE = "/cron/daily-recap";
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MORNING_HOUR = 8;
const EVENING_HOUR = 19;

async function getParisHour(): Promise<number> {
  const db = getDb();
  const [rows] = await db.query(
    `SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Paris')::int AS hour`,
    []
  );
  return (rows as any[])[0]?.hour ?? new Date().getHours();
}

/** Claims eligible pros for a given notification type — NOT EXISTS on today's notifications avoids a duplicate send within the same day. */
async function claimEligiblePros(settingsColumn: "daily_reminder" | "activity_summary", notifType: string): Promise<number[]> {
  const db = getDb();
  const [rows] = await db.query(
    `SELECT u.id
     FROM users u
     LEFT JOIN pro_notification_settings pns ON pns.user_id = u.id
     WHERE u.role = 'pro' AND u.pro_status = 'active'
       AND COALESCE(pns.${settingsColumn}, ${settingsColumn === "activity_summary" ? "false" : "true"}) = true
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = u.id AND n.type = ?
           AND n.created_at >= (CURRENT_DATE AT TIME ZONE 'Europe/Paris')
       )`,
    [notifType]
  );
  return (rows as any[]).map((r) => r.id);
}

async function sendMorningRecaps(): Promise<void> {
  const db = getDb();
  const proIds = await claimEligiblePros("daily_reminder", "daily_reminder");
  let sent = 0;

  for (const proId of proIds) {
    try {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt, MIN(TO_CHAR(start_datetime AT TIME ZONE 'Europe/Paris', 'HH24"h"MI')) AS first_time
         FROM reservations
         WHERE pro_id = ?
           AND DATE(start_datetime AT TIME ZONE 'Europe/Paris') = (NOW() AT TIME ZONE 'Europe/Paris')::date
           AND status = 'confirmed'`,
        [proId]
      );
      const row = (rows as any[])[0];
      const count = Number(row?.cnt) || 0;
      if (count === 0) continue; // rien à récapituler, pas de notif creuse

      const title = "Ton programme du jour";
      const body = count === 1
        ? `1 rendez-vous aujourd'hui, à ${row.first_time}.`
        : `${count} rendez-vous aujourd'hui, le premier à ${row.first_time}.`;

      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'daily_reminder', ?, ?, ?)`,
        [proId, title, body, JSON.stringify({ count })]
      );
      await sendExpoPushToUsers([proId], { title, body, data: { type: "daily_reminder" } });
      sent++;
    } catch (err) {
      log.error(ROUTE, `Morning recap failed for pro ${proId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  if (sent > 0) log.warn(ROUTE, `Morning recap: ${sent} sent`);
}

async function sendEveningSummaries(): Promise<void> {
  const db = getDb();
  const proIds = await claimEligiblePros("activity_summary", "activity_summary");
  let sent = 0;

  for (const proId of proIds) {
    try {
      const [rows] = await db.query(
        `SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date AS today`,
        []
      );
      const today = (rows as any[])[0]?.today;
      const stats = await getRevenueStats(db, proId, today, today);
      if (stats.count === 0) continue; // rien à résumer

      const title = "Résumé de ta journée";
      const body = stats.count === 1
        ? `${stats.revenue.toFixed(0)} € encaissés sur 1 rendez-vous aujourd'hui.`
        : `${stats.revenue.toFixed(0)} € encaissés sur ${stats.count} rendez-vous aujourd'hui.`;

      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'activity_summary', ?, ?, ?)`,
        [proId, title, body, JSON.stringify(stats)]
      );
      await sendExpoPushToUsers([proId], { title, body, data: { type: "activity_summary" } });
      sent++;
    } catch (err) {
      log.error(ROUTE, `Evening summary failed for pro ${proId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  if (sent > 0) log.warn(ROUTE, `Evening summary: ${sent} sent`);
}

export async function runDailyRecapCycle(): Promise<void> {
  const hour = await getParisHour();
  if (hour === MORNING_HOUR) {
    await sendMorningRecaps().catch((err) => log.error(ROUTE, "Morning cycle failed", err instanceof Error ? err.stack : String(err)));
  }
  if (hour === EVENING_HOUR) {
    await sendEveningSummaries().catch((err) => log.error(ROUTE, "Evening cycle failed", err instanceof Error ? err.stack : String(err)));
  }
}

export function startDailyRecapCron(): void {
  setTimeout(() => { runDailyRecapCycle().catch(() => {}); }, 30_000);
  setInterval(() => { runDailyRecapCycle().catch(() => {}); }, INTERVAL_MS);
  log.warn(ROUTE, "Daily recap cron started (checks every 15 min for 8h/19h Europe/Paris)");
}
