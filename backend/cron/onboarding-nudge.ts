/**
 * #34 — Relances push de l'onboarding client (J+1 / J+3 / J+7).
 *
 * Pour chaque client dont l'onboarding est commencé mais non terminé
 * (client_onboarding.completed_at IS NULL) ET qui n'a encore RÉSERVÉ aucun
 * RDV, envoie une relance 1, 3 et 7 jours après started_at.
 *
 * Idempotent : nudge_dN_sent horodaté après envoi, jamais renvoyé.
 * Respecte client_notification_settings.offers. FOR UPDATE SKIP LOCKED.
 */

import { sendPushToUser, sendExpoPushToUsers } from "../lib/push";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/onboarding-nudge";
const INTERVAL_MS = 60 * 60 * 1000; // 1 h

interface Nudge {
  col: "nudge_d1_sent" | "nudge_d3_sent" | "nudge_d7_sent";
  days: number;
  title: string;
  body: string;
}

const NUDGES: Nudge[] = [
  {
    col: "nudge_d1_sent",
    days: 1,
    title: "Tes ongles t'attendent 💅",
    body: "Ton style est enregistré — découvre les prothésistes ongulaires qu'on a sélectionnées pour toi.",
  },
  {
    col: "nudge_d3_sent",
    days: 3,
    title: "Encore là ?",
    body: "Les meilleures ongleries partent vite. Jette un œil à tes 3 recommandations avant qu'elles n'affichent complet.",
  },
  {
    col: "nudge_d7_sent",
    days: 7,
    title: "On garde ta place au chaud",
    body: "Ton premier RDV nails est à quelques taps. Choisis un créneau qui t'arrange.",
  },
];

function claimQuery(col: Nudge["col"]): string {
  // col est une valeur littérale contrôlée (jamais d'entrée utilisateur).
  return `
    WITH eligible AS (
      SELECT o.client_id
      FROM client_onboarding o
      JOIN users u ON u.id = o.client_id AND u.is_active = TRUE AND u.role = 'client'
      LEFT JOIN client_notification_settings cns ON cns.user_id = o.client_id
      WHERE o.completed_at IS NULL
        AND o.${col} IS NULL
        AND o.started_at <= NOW() - (? * INTERVAL '1 day')
        AND COALESCE(cns.offers, true) = true
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.client_id = o.client_id)
      FOR UPDATE OF o SKIP LOCKED
    ),
    claimed AS (
      UPDATE client_onboarding SET ${col} = NOW()
      FROM eligible
      WHERE client_onboarding.client_id = eligible.client_id
      RETURNING client_onboarding.client_id
    )
    SELECT client_id FROM claimed
  `;
}

async function runNudge(nudge: Nudge): Promise<number> {
  const db = getDb();
  const [rows] = (await db.query(claimQuery(nudge.col), [nudge.days])) as [Array<{ client_id: number }>, unknown];

  let sent = 0;
  for (const { client_id } of rows) {
    try {
      await sendPushToUser(client_id, { title: nudge.title, body: nudge.body, url: "/onboarding", tag: `onboarding-${nudge.col}` });
      await sendExpoPushToUsers([client_id], {
        title: nudge.title,
        body: nudge.body,
        data: { type: "onboarding_nudge", step: nudge.days },
      });
      await db.execute(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'onboarding_nudge', ?, ?, ?)`,
        [client_id, nudge.title, nudge.body, JSON.stringify({ nudge: nudge.col })]
      );
      sent++;
    } catch (err) {
      log.error(ROUTE, `nudge ${nudge.col} failed for client ${client_id}`, err instanceof Error ? err.stack : String(err));
    }
  }
  return sent;
}

export async function runOnboardingNudgeCycle(): Promise<void> {
  try {
    let total = 0;
    for (const nudge of NUDGES) total += await runNudge(nudge);
    if (total > 0) log.warn(ROUTE, `${total} onboarding nudge(s) sent`);
  } catch (err) {
    log.error(ROUTE, "cycle failed", err instanceof Error ? err.stack : String(err));
  }
}

export function startOnboardingNudgeCron(): void {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    log.warn(ROUTE, "VAPID keys not configured — onboarding-nudge cron disabled");
    return;
  }
  setTimeout(() => { runOnboardingNudgeCycle().catch(() => {}); }, 6 * 60 * 1000);
  setInterval(() => { runOnboardingNudgeCycle().catch(() => {}); }, INTERVAL_MS);
  log.warn(ROUTE, "Onboarding-nudge cron started (every 1h)");
}
