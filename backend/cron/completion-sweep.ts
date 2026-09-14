/**
 * Reservation completion sweep cron — runs every 30 minutes.
 *
 * Une réservation `confirmed` ne passe à `completed` que si la pro clique
 * « Marquer terminé » dans son calendrier mobile
 * (PATCH /api/pro/reservations/:id/status) — un geste manuel, facilement
 * oublié. Sans lui : la cliente ne voit jamais le bouton « Laisser un avis »
 * (gated sur status='completed' côté mobile), et la réservation reste
 * `confirmed` indéfiniment — silencieusement, aucune erreur nulle part.
 *
 * Ce cron rattrape l'oubli : toute réservation `confirmed` dont le jour
 * calendaire (Europe/Paris) est déjà passé passe automatiquement à
 * `completed` — dans la nuit qui suit le RDV, pas 24h après son heure de
 * fin. Ça laisse à la pro jusqu'à minuit (heure de Paris) le jour même pour
 * marquer une absence — `PATCH /pro/reservations/:id/no-show`, sans limite
 * de délai côté serveur — avant que ce sweep ne referme le RDV à sa place :
 * une fois `completed`, ni no-show ni annulation ne sont plus possibles
 * (l'endpoint no-show rejette toute réservation déjà finalisée).
 *
 * Ne touche à rien d'autre que `status`/`updated_at` : pas de notification,
 * pas de remboursement, pas de paiement — l'auto-complétion d'un RDV où le
 * solde restait dû, par exemple, reste géré ailleurs (facture/solde inchangés).
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/completion-sweep";
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function sweepPastConfirmedReservations(): Promise<number> {
  const db = getDb();

  // WHERE status = 'confirmed' scope l'UPDATE : une réservation annulée ou
  // déjà marquée completed/no-show entre-temps par la pro n'est jamais
  // écrasée — même garde que reschedule-sweep.ts.
  // Comparaison sur le jour calendaire Europe/Paris (pas un delta d'heures
  // fixe) : un RDV à 15h aujourd'hui bascule dès le passage à minuit, pas
  // le lendemain à 15h.
  const [rows] = await db.execute(
    `UPDATE reservations
     SET status = 'completed', updated_at = NOW()
     WHERE status = 'confirmed'
       AND (end_datetime AT TIME ZONE 'Europe/Paris')::date
         < (NOW() AT TIME ZONE 'Europe/Paris')::date
     RETURNING id`
  );

  const completed = rows as Array<{ id: number }>;
  if (completed.length > 0) {
    // IDs uniquement — aucune donnée personnelle (client, pro, prestation).
    log.warn(ROUTE, `Auto-completed ${completed.length} past confirmed reservation(s)`, {
      reservationIds: completed.map((r) => r.id),
    });
  }
  return completed.length;
}

export async function runCompletionSweep(): Promise<void> {
  try {
    await sweepPastConfirmedReservations();
  } catch (err) {
    log.error(
      ROUTE,
      "Completion sweep cycle failed",
      err instanceof Error ? err.stack : String(err)
    );
  }
}

export function startCompletionSweepCron(): void {
  setTimeout(() => {
    runCompletionSweep().catch(() => {});
  }, 2 * 60 * 1000);

  setInterval(() => {
    runCompletionSweep().catch(() => {});
  }, INTERVAL_MS);
}
