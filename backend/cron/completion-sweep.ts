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
 * Ce cron rattrape l'oubli : toute réservation `confirmed` dont la fin
 * (`end_datetime`) est dépassée depuis plus de COMPLETION_GRACE_HOURS passe
 * automatiquement à `completed`. Le délai de grâce laisse à la pro le temps
 * de marquer une absence — `PATCH /pro/reservations/:id/no-show`, sans
 * limite de délai côté serveur — avant que ce sweep ne referme le RDV à sa
 * place : une fois `completed`, ni no-show ni annulation ne sont plus
 * possibles (l'endpoint no-show rejette toute réservation déjà finalisée).
 *
 * Ne touche à rien d'autre que `status`/`updated_at` : pas de notification,
 * pas de remboursement, pas de paiement — l'auto-complétion d'un RDV où le
 * solde restait dû, par exemple, reste géré ailleurs (facture/solde inchangés).
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/completion-sweep";
const COMPLETION_GRACE_HOURS = 24;
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function sweepPastConfirmedReservations(): Promise<number> {
  const db = getDb();

  // WHERE status = 'confirmed' scope l'UPDATE : une réservation annulée ou
  // déjà marquée completed/no-show entre-temps par la pro n'est jamais
  // écrasée — même garde que reschedule-sweep.ts.
  const [rows] = await db.execute(
    `UPDATE reservations
     SET status = 'completed', updated_at = NOW()
     WHERE status = 'confirmed'
       AND end_datetime < NOW() - MAKE_INTERVAL(hours => ${COMPLETION_GRACE_HOURS})
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
