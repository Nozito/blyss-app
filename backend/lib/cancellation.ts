/**
 * Utilitaires de politique d'annulation.
 * Fonctions pures — aucune dépendance base de données.
 * La vérification côté serveur doit toujours utiliser ces fonctions.
 */

/** Valeurs de délai d'annulation autorisées (en heures). */
export const ALLOWED_NOTICE_HOURS = [0, 2, 4, 6, 12, 24, 48, 72] as const;
export type NoticeHours = (typeof ALLOWED_NOTICE_HOURS)[number];

/**
 * Calcule la date/heure limite d'annulation pour un RDV donné.
 *
 * @param appointmentStartAt - Début du RDV (UTC recommandé)
 * @param noticeHours - Délai minimum configuré par le pro (0 = toujours possible)
 * @returns La date limite avant laquelle l'annulation est possible.
 *          Si noticeHours = 0, retourne `appointmentStartAt` (= limit = now possible up to start)
 */
export function getCancellationDeadline(
  appointmentStartAt: Date,
  noticeHours: number
): Date {
  if (!Number.isFinite(noticeHours) || noticeHours < 0) {
    throw new RangeError(`noticeHours doit être un entier >= 0, reçu : ${noticeHours}`);
  }
  const deadline = new Date(appointmentStartAt.getTime());
  deadline.setTime(deadline.getTime() - noticeHours * 60 * 60 * 1000);
  return deadline;
}

/**
 * Détermine si une annulation est encore autorisée à l'instant `now`.
 *
 * Règle : annulation autorisée si now < (appointmentStartAt − noticeHours)
 * Cas limite : si now === deadline exactement → REFUSÉ (côté sécuritaire).
 *
 * @param appointmentStartAt - Début du RDV
 * @param noticeHours - Délai minimum configuré par le pro
 * @param now - Instant de référence (injecté pour les tests ; par défaut `new Date()`)
 */
export function canCancelAppointment(
  appointmentStartAt: Date,
  noticeHours: number,
  now: Date = new Date()
): boolean {
  if (!Number.isFinite(noticeHours) || noticeHours < 0) {
    throw new RangeError(`noticeHours doit être un entier >= 0, reçu : ${noticeHours}`);
  }
  // noticeHours = 0 signifie "annulation toujours possible jusqu'au début du RDV"
  if (noticeHours === 0) {
    return now < appointmentStartAt;
  }
  const deadline = getCancellationDeadline(appointmentStartAt, noticeHours);
  // Strictement inférieur : exactement à la limite → refusé
  return now < deadline;
}

/**
 * Typed error raised by the cancel endpoint when the deadline has passed.
 * Use `instanceof CancellationWindowExpiredError` to detect this case.
 */
export class CancellationWindowExpiredError extends Error {
  readonly code = "cancellation_window_expired" as const;
  readonly deadline: Date;

  constructor(deadline: Date) {
    super(
      `La date limite d'annulation est dépassée (limite : ${deadline.toISOString()}).`
    );
    this.name = "CancellationWindowExpiredError";
    this.deadline = deadline;
  }
}
