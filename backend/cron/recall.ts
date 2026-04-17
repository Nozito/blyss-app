/**
 * Recall reminder cron — runs every hour.
 *
 * Pour chaque prestation avec recall_weeks défini, envoie un push à la
 * cliente X semaines après son dernier RDV complété avec cette prestation.
 *
 * Exemples métier prothésiste ongulaire :
 *   - Pose gel : recall à 3 semaines ("Votre gel a 3 semaines, heure de renouveler !")
 *   - Semi-permanent : recall à 2 semaines
 *   - Manucure classique : recall à 4 semaines
 *
 * Idempotent : recall_sent = TRUE après envoi, never sent twice per reservation.
 * Uses FOR UPDATE SKIP LOCKED for concurrent-safe claiming.
 */

import { sendPushToUser } from "../lib/push";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/recall";
const INTERVAL_MS = 60 * 60 * 1000; // 1 heure

const RECALL_CLAIM_QUERY = `
  WITH eligible AS (
    SELECT r.id, r.client_id, r.pro_id, r.prestation_id, r.start_datetime
    FROM reservations r
    JOIN prestations p ON p.id = r.prestation_id
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = TRUE
    WHERE r.status = 'completed'
      AND r.recall_sent = FALSE
      AND p.recall_weeks IS NOT NULL
      AND r.start_datetime <= NOW() - (p.recall_weeks * INTERVAL '1 week')
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET recall_sent = TRUE
    FROM eligible
    WHERE reservations.id = eligible.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id
  )
  SELECT
    c.id,
    c.client_id,
    c.pro_id,
    COALESCE(p.name, 'votre soin') AS prestation_name,
    p.recall_weeks,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

async function sendRecallReminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(RECALL_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    try {
      await sendPushToUser(row.client_id, {
        title: "C'est l'heure de votre prochain rendez-vous ✨",
        body: `Votre ${row.prestation_name} avec ${row.pro_name} date de ${row.recall_weeks} semaine(s). Pensez à rebooker !`,
        url: `/pro/${row.pro_id}`,
        tag: `recall-${row.id}`,
      });

      // Insert notification in DB for in-app display
      await db.execute(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'recall', 'C'est l''heure de rebooker !', ?, ?)`,
        [
          row.client_id,
          `Votre ${row.prestation_name} avec ${row.pro_name} date de ${row.recall_weeks} semaine(s). Pensez à rebooker !`,
          JSON.stringify({ pro_id: row.pro_id, prestation_id: row.prestation_id }),
        ]
      );

      sent++;
    } catch (err) {
      log.error(ROUTE, `Failed to send recall for reservation ${row.id}`, err instanceof Error ? err.stack : String(err));
    }
  }

  if (sent > 0) {
    log.warn(ROUTE, `Recall: ${sent} reminder(s) sent`);
  }
}

export async function runRecallCycle(): Promise<void> {
  try {
    await sendRecallReminders();
  } catch (err) {
    log.error(ROUTE, "Recall cycle failed", err instanceof Error ? err.stack : String(err));
  }
}

export function startRecallCron(): void {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    log.warn(ROUTE, "VAPID keys not configured — recall cron disabled");
    return;
  }

  // First run 5 minutes after startup
  setTimeout(() => { runRecallCycle().catch(() => {}); }, 5 * 60 * 1000);

  setInterval(() => { runRecallCycle().catch(() => {}); }, INTERVAL_MS);

  log.warn(ROUTE, "Recall cron started (every 1h)");
}
