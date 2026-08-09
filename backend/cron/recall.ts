/**
 * Recall reminder cron — runs every hour.
 *
 * Pour chaque prestation avec recall_weeks défini, envoie un push à la
 * cliente X semaines après son dernier RDV complété avec cette prestation.
 *
 * Exemples métier prothésiste ongulaire :
 *   - Pose gel : recall à 3 semaines ("Ça fait 3 semaines... Reprends rendez-vous !")
 *   - Semi-permanent : recall à 2 semaines
 *   - Manucure classique : recall à 4 semaines
 *
 * Idempotent : recall_sent = TRUE après envoi, never sent twice per reservation.
 * Uses FOR UPDATE SKIP LOCKED for concurrent-safe claiming.
 */

import { sendPushToUser, sendExpoPushToUsers } from "../lib/push";
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
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE r.status = 'completed'
      AND r.recall_sent = FALSE
      AND p.recall_weeks IS NOT NULL
      AND r.start_datetime <= NOW() - (p.recall_weeks * INTERVAL '1 week')
      AND COALESCE(cns.offers, true) = true
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
    COALESCE(p.name, 'un soin') AS prestation_name,
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
      // "votre" sidestepped the gender agreement a possessive would need in
      // front of an arbitrary pro-defined prestation name (masculine "ton"
      // vs feminine "ta") — this phrasing avoids the possessive entirely
      // instead of guessing.
      const title = "Envie d'y retourner ?";
      const body = `Ça fait ${row.recall_weeks} semaine(s) que tu n'as pas refait ${row.prestation_name} chez ${row.pro_name}. Reprends rendez-vous quand tu veux !`;
      await sendPushToUser(row.client_id, {
        title,
        body,
        url: `/pro/${row.pro_id}`,
        tag: `recall-${row.id}`,
      });
      await sendExpoPushToUsers([row.client_id], {
        title,
        body,
        data: { type: "recall", pro_id: row.pro_id, prestation_id: row.prestation_id },
      });

      // Insert notification in DB for in-app display
      await db.execute(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'recall', ?, ?, ?)`,
        [
          row.client_id,
          title,
          body,
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
