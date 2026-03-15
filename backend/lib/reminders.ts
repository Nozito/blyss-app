/**
 * Appointment reminder cron — runs every 15 minutes.
 *
 * Sends push notifications to clients:
 *   - J-1  : day before the appointment (sent once, any time that day)
 *   - H-2  : ~2 hours before the appointment (±10 min window for 15-min cycle)
 *
 * Respects client_notification_settings.reminders preference.
 * Each reminder is idempotent via reminder_j1_sent / reminder_h2_sent flags.
 *
 * Race condition prevention: a single CTE atomically marks rows (UPDATE...RETURNING)
 * with FOR UPDATE SKIP LOCKED so concurrent instances never double-send.
 */

import { sendPushToUser } from "./push";
import { getDb } from "./db";

/**
 * Atomically claims J-1 reminders that have not been sent yet and returns
 * their data. Uses FOR UPDATE SKIP LOCKED + UPDATE...RETURNING in one CTE
 * so concurrent cron instances cannot claim the same row.
 */
const J1_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = true
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE
      DATE(r.start_datetime AT TIME ZONE 'Europe/Paris') = (CURRENT_DATE + INTERVAL '1 day')
      AND r.status = 'confirmed'
      AND r.reminder_j1_sent = false
      AND COALESCE(cns.reminders, true) = true
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET reminder_j1_sent = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id,
      TO_CHAR(reservations.start_datetime AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS rdv_time
  )
  SELECT
    c.id,
    c.client_id,
    c.rdv_time,
    COALESCE(p.name, 'Soin') AS prestation_name,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

/**
 * Atomically claims H-2 reminders using the same CTE pattern.
 */
const H2_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = true
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE
      r.start_datetime BETWEEN
        (NOW() + INTERVAL '1 hour 50 minutes') AND
        (NOW() + INTERVAL '2 hours 10 minutes')
      AND r.status = 'confirmed'
      AND r.reminder_h2_sent = false
      AND COALESCE(cns.reminders, true) = true
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET reminder_h2_sent = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id,
      TO_CHAR(reservations.start_datetime AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS rdv_time
  )
  SELECT
    c.id,
    c.client_id,
    c.rdv_time,
    COALESCE(p.name, 'Soin') AS prestation_name,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

async function sendJ1Reminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(J1_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    await sendPushToUser(row.client_id, {
      title: "Rappel rendez-vous demain ✨",
      body: `Ton RDV à ${row.rdv_time} avec ${row.pro_name} (${row.prestation_name}) est demain !`,
      url: "/client/bookings",
      tag: `rdv-j1-${row.id}`,
    });
    sent++;
  }

  if (sent > 0) {
    console.log(`[reminders] J-1: ${sent} reminder(s) sent`);
  }
}

async function sendH2Reminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(H2_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    await sendPushToUser(row.client_id, {
      title: "Ton RDV approche ⏰",
      body: `Ton rendez-vous à ${row.rdv_time} avec ${row.pro_name} est dans 2h !`,
      url: "/client/bookings",
      tag: `rdv-h2-${row.id}`,
    });
    sent++;
  }

  if (sent > 0) {
    console.log(`[reminders] H-2: ${sent} reminder(s) sent`);
  }
}

export async function runReminderCycle(): Promise<void> {
  await Promise.allSettled([sendJ1Reminders(), sendH2Reminders()]);
}

/**
 * Starts the reminder cron (every 15 minutes).
 * No-op if VAPID keys are not configured.
 */
export function startReminderCron(): void {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log("[reminders] VAPID keys not configured — reminders disabled");
    return;
  }

  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // First run after 30s (let the server finish booting)
  setTimeout(async () => {
    try {
      await runReminderCycle();
    } catch (err) {
      console.error("[reminders] initial run error:", err);
    }
  }, 30_000);

  setInterval(async () => {
    try {
      await runReminderCycle();
    } catch (err) {
      console.error("[reminders] cycle error:", err);
    }
  }, INTERVAL_MS);

  console.log("[reminders] cron started (every 15 min)");
}
