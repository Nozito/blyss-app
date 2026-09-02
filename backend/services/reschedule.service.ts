/**
 * Workflow de consentement client pour le report d'un RDV proposé par la pro.
 *
 * Principe : `reservations` ne doit JAMAIS être modifiée directement suite à
 * une action unilatérale de la pro sur un RDV confirmé. La pro propose
 * (createRescheduleRequest), la cliente accepte ou refuse
 * (accept/declineRescheduleRequest). La réservation originale reste intacte
 * tant que la cliente n'a pas explicitement accepté.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { sendNotificationToUser } from "../lib/notifications";
import { formatRdvWhen } from "../lib/notifyDate";
import { RESERVATION_LOCK_NS } from "../lib/locks";
import {
  checkSlotAvailability,
  AvailabilityError,
  type UnavailableReason,
} from "./availability.service";

const db = getDb();

export const SLOT_NO_LONGER_AVAILABLE = "SLOT_NO_LONGER_AVAILABLE";

export class RescheduleServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

/** Message client selon le motif de refus renvoyé par le moteur de disponibilité. */
function rescheduleUnavailableMessage(reason: UnavailableReason | undefined): string {
  switch (reason) {
    case "outside_hours":
      return "Ce créneau est en dehors des horaires d'ouverture du professionnel.";
    case "overlaps_unavailability":
      return "Ce créneau chevauche une absence du professionnel.";
    case "overlaps_reservation":
      return "Ce créneau vient d'être réservé.";
    case "before_lead_time":
    case "after_horizon":
      return "Ce créneau n'est plus réservable.";
    default:
      return "Ce créneau n'est plus disponible.";
  }
}

export type InitiatedVia = "app" | "phone";

interface CreateRescheduleRequestInput {
  reservationId: number;
  proId: number;
  proposedStart: string;
  proposedEnd: string;
  proposedPrestationId?: number;
  reason?: string | null;
  initiatedVia?: InitiatedVia;
}

export async function createRescheduleRequest(input: CreateRescheduleRequestInput) {
  const { reservationId, proId, proposedStart, proposedEnd, proposedPrestationId, reason, initiatedVia = "app" } = input;

  if (initiatedVia === "phone" && !reason?.trim()) {
    throw new RescheduleServiceError(400, "Un motif est requis pour une proposition annoncée par téléphone");
  }

  const [existing] = await db.query(
    `SELECT id, status, client_id, prestation_id, price, start_datetime FROM reservations WHERE id = ? AND pro_id = ?`,
    [reservationId, proId]
  );
  const reservation = (existing as any[])[0];
  if (!reservation) {
    throw new RescheduleServiceError(404, "Réservation non trouvée");
  }
  if (reservation.status === "cancelled" || reservation.status === "completed") {
    throw new RescheduleServiceError(400, "Impossible de modifier une réservation finalisée ou annulée");
  }

  let newPrestationId = reservation.prestation_id;
  let newPrice = Number(reservation.price);
  if (proposedPrestationId && proposedPrestationId !== reservation.prestation_id) {
    const [prestationRows] = await db.query(
      `SELECT id, price FROM prestations WHERE id = ? AND pro_id = ?`,
      [proposedPrestationId, proId]
    );
    if ((prestationRows as any[]).length === 0) {
      throw new RescheduleServiceError(403, "Prestation invalide pour ce professionnel");
    }
    newPrestationId = proposedPrestationId;
    newPrice = Number((prestationRows as any[])[0].price);
  }

  const reservationStart = new Date(reservation.start_datetime).getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const expiresAtMs = Math.min(Date.now() + twentyFourHoursMs, reservationStart);
  if (expiresAtMs <= Date.now()) {
    throw new RescheduleServiceError(
      400,
      "Ce rendez-vous est trop proche pour proposer un report via l'application — contacte directement la cliente."
    );
  }
  const expiresAt = new Date(expiresAtMs).toISOString();

  let requestRows;
  try {
    [requestRows] = await db.query(
      `INSERT INTO reschedule_requests
         (reservation_id, initiated_by, reason, proposed_start_datetime, proposed_end_datetime,
          proposed_prestation_id, proposed_price, expires_at, created_by_user_id, initiated_via)
       VALUES (?, 'pro', ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, expires_at`,
      [reservationId, reason ?? null, proposedStart, proposedEnd, newPrestationId, newPrice, expiresAt, proId, initiatedVia]
    );
  } catch (err) {
    // Contrainte d'unicité partielle (une seule proposition pending par réservation) —
    // ne convertir que la violation réelle en 409, laisser remonter les autres erreurs.
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505" || /unique constraint/i.test((err as Error)?.message ?? "")) {
      throw new RescheduleServiceError(409, "Une proposition de report est déjà en attente pour ce rendez-vous");
    }
    throw err;
  }
  const created = (requestRows as any[])[0];

  try {
    const message =
      initiatedVia === "phone"
        ? `Ta pro te propose un nouveau créneau le ${formatRdvWhen(new Date(proposedStart))} suite à votre échange téléphonique. Accepte ou refuse dans l'application.`
        : `Ta pro te propose un nouveau créneau le ${formatRdvWhen(new Date(proposedStart))}. Accepte ou refuse dans l'application.`;
    const [notifRows] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'booking_reschedule_proposed', 'Nouveau créneau proposé', ?, ?)
       RETURNING id, created_at`,
      [reservation.client_id, message, JSON.stringify({ request_id: created.id, reservation_id: reservationId })]
    );
    const notif = (notifRows as any[])[0];
    if (notif) {
      await sendNotificationToUser(reservation.client_id, {
        id: notif.id,
        type: "booking_reschedule_proposed",
        title: "Nouveau créneau proposé",
        message,
        data: { request_id: created.id, reservation_id: reservationId },
        created_at: notif.created_at,
      });
    }
  } catch (notifErr) {
    log.warn("[RESCHEDULE_CREATE]", "Client notification failed (non-fatal)", { reservationId });
  }

  return { requestId: created.id, expiresAt: created.expires_at };
}

interface ClientActionInput {
  requestId: number;
  clientId: number;
}

async function loadRequestForClient(requestId: number, clientId: number) {
  const [rows] = await db.query(
    `SELECT rr.id, rr.reservation_id, rr.status, rr.expires_at, rr.initiated_via, rr.reason,
            rr.proposed_start_datetime, rr.proposed_end_datetime, rr.proposed_prestation_id, rr.proposed_price,
            r.pro_id, r.client_id, r.start_datetime AS original_start_datetime, r.end_datetime AS original_end_datetime
     FROM reschedule_requests rr
     JOIN reservations r ON r.id = rr.reservation_id
     WHERE rr.id = ? AND r.client_id = ?`,
    [requestId, clientId]
  );
  return (rows as any[])[0];
}

export async function getRescheduleRequestForClient({ requestId, clientId }: ClientActionInput) {
  const request = await loadRequestForClient(requestId, clientId);
  if (!request) {
    throw new RescheduleServiceError(404, "Proposition de report non trouvée");
  }
  return request;
}

export async function acceptRescheduleRequest({ requestId, clientId }: ClientActionInput) {
  const request = await loadRequestForClient(requestId, clientId);
  if (!request) {
    throw new RescheduleServiceError(404, "Proposition de report non trouvée");
  }
  if (request.status !== "pending") {
    throw new RescheduleServiceError(409, `Cette proposition n'est plus disponible (statut: ${request.status})`);
  }
  if (new Date(request.expires_at).getTime() <= Date.now()) {
    await db.query(`UPDATE reschedule_requests SET status = 'expired' WHERE id = ?`, [requestId]);
    throw new RescheduleServiceError(410, "Cette proposition a expiré");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // MÊME clé de verrou que reservation.service.ts (withProReservationLock) :
    // (RESERVATION_LOCK_NS, pro_id). Indispensable pour que l'acceptation d'un
    // reschedule et une réservation cliente concurrente chez la même pro soient
    // bien sérialisées l'une par rapport à l'autre (scénario C5 du design 3.3).
    await connection.query(`SELECT pg_advisory_xact_lock(?, ?)`, [RESERVATION_LOCK_NS, request.pro_id]);

    // Re-vérifie l'état de la proposition ET de la réservation sous verrou (une
    // autre requête a pu faire évoluer l'une ou l'autre entre-temps — ex. la
    // réservation a été annulée après la création de cette proposition).
    const [freshRows] = await connection.query(
      `SELECT rr.status, rr.expires_at, r.status AS reservation_status
       FROM reschedule_requests rr
       JOIN reservations r ON r.id = rr.reservation_id
       WHERE rr.id = ?`,
      [requestId]
    );
    const fresh = (freshRows as any[])[0];
    if (!fresh || fresh.status !== "pending") {
      // Déjà traitée entre-temps par une autre action (accept/decline concurrent) :
      // ne jamais écraser un statut déjà final.
      await connection.rollback();
      throw new RescheduleServiceError(409, "Cette proposition n'est plus disponible");
    }
    if (
      new Date(fresh.expires_at).getTime() <= Date.now() ||
      fresh.reservation_status === "cancelled" ||
      fresh.reservation_status === "completed"
    ) {
      // Encore "pending" mais plus valide (expirée, ou réservation annulée entre
      // la création de la proposition et cette tentative d'acceptation) : on sait
      // que le statut est bien 'pending' ici, donc l'écraser en 'expired' est sûr.
      await connection.query(`UPDATE reschedule_requests SET status = 'expired' WHERE id = ? AND status = 'pending'`, [requestId]);
      await connection.commit();
      throw new RescheduleServiceError(409, "Cette proposition n'est plus disponible");
    }

    // Re-check sous verrou avec le MOTEUR COMPLET (checkSlotAvailability) au
    // lieu de l'ancienne requête de chevauchement maison, qui ignorait les
    // absences (unavailabilities), les horaires d'ouverture et le
    // buffer_before de la prestation proposée — et lisait start/end_datetime
    // au lieu des colonnes d'autorité blocked_* (revue sécurité M3).
    //
    // Le verrou consultatif pris ci-dessus (RESERVATION_LOCK_NS, pro_id)
    // sérialise les créations / reports concurrents de cette pro : toute
    // écriture concurrente est bloquée sur ce verrou, l'état lu par
    // checkSlotAvailability est donc stable jusqu'au COMMIT.
    let availability;
    try {
      availability = await checkSlotAvailability({
        proId: request.pro_id,
        serviceIds: [request.proposed_prestation_id],
        startDatetime: request.proposed_start_datetime,
        excludeReservationId: request.reservation_id,
        requestedByRole: "pro",
      });
    } catch (checkErr) {
      if (checkErr instanceof AvailabilityError) {
        throw new RescheduleServiceError(checkErr.status, checkErr.message, checkErr.code);
      }
      throw checkErr;
    }

    if (!availability.available) {
      await connection.query(
        `UPDATE reschedule_requests SET status = 'expired' WHERE id = ? AND status = 'pending'`,
        [requestId]
      );
      await connection.commit();
      log.warn("[RESCHEDULE_ACCEPT]", "re-check moteur : créneau indisponible", {
        requestId,
        reservationId: request.reservation_id,
        reason: availability.reason,
      });
      throw new RescheduleServiceError(
        409,
        rescheduleUnavailableMessage(availability.reason),
        SLOT_NO_LONGER_AVAILABLE
      );
    }

    // Snapshot de calcul (blocked_start/end_datetime, buffers, durée) réécrit
    // au nouveau créneau — sinon le moteur continuerait de bloquer l'ancienne
    // plage et de laisser la nouvelle libre. Les valeurs sont prises TELLES
    // QUELLES du moteur (durée + buffers dérivés de la prestation, comme pour
    // createReservation) : la fenêtre vérifiée == la fenêtre écrite. La durée
    // « visible » suit la prestation proposée ; `proposed_end_datetime` de la
    // proposition devient indicatif.
    await connection.query(
      `UPDATE reservations
         SET start_datetime = ?, end_datetime = ?, prestation_id = ?, price = ?, slot_id = NULL,
             service_duration_minutes = ?, buffer_before_minutes = ?, buffer_after_minutes = ?,
             blocked_start_datetime = ?, blocked_end_datetime = ?
       WHERE id = ?`,
      [
        request.proposed_start_datetime,
        availability.visibleEnd,
        request.proposed_prestation_id,
        request.proposed_price,
        availability.serviceDurationMinutes,
        availability.bufferBeforeMinutes,
        availability.bufferAfterMinutes,
        availability.blockedStart,
        availability.blockedEnd,
        request.reservation_id,
      ]
    );
    await connection.query(
      `UPDATE reschedule_requests SET status = 'accepted', accepted_at = NOW() WHERE id = ?`,
      [requestId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }

  try {
    const message = `La cliente a accepté le nouveau créneau du ${formatRdvWhen(new Date(request.proposed_start_datetime))}.`;
    const [notifRows] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'booking_rescheduled', 'Report accepté', ?, ?)
       RETURNING id, created_at`,
      [request.pro_id, message, JSON.stringify({ reservation_id: request.reservation_id })]
    );
    const notif = (notifRows as any[])[0];
    if (notif) {
      await sendNotificationToUser(request.pro_id, {
        id: notif.id,
        type: "booking_rescheduled",
        title: "Report accepté",
        message,
        data: { reservation_id: request.reservation_id },
        created_at: notif.created_at,
      });
    }
  } catch (notifErr) {
    log.warn("[RESCHEDULE_ACCEPT]", "Pro notification failed (non-fatal)", { requestId });
  }

  return { reservationId: request.reservation_id };
}

export async function declineRescheduleRequest({ requestId, clientId }: ClientActionInput) {
  const request = await loadRequestForClient(requestId, clientId);
  if (!request) {
    throw new RescheduleServiceError(404, "Proposition de report non trouvée");
  }
  if (request.status !== "pending") {
    throw new RescheduleServiceError(409, `Cette proposition n'est plus disponible (statut: ${request.status})`);
  }

  // Garde l'UPDATE conditionné à status='pending' : si un accept concurrent a
  // déjà fait passer la proposition à 'accepted' entre la lecture ci-dessus et
  // cet UPDATE, on ne doit jamais écraser ce statut final par 'declined'.
  const [declineRows] = await db.query(
    `UPDATE reschedule_requests SET status = 'declined' WHERE id = ? AND status = 'pending' RETURNING id`,
    [requestId]
  );
  if ((declineRows as any[]).length === 0) {
    throw new RescheduleServiceError(409, "Cette proposition vient d'être traitée, réessaie");
  }

  try {
    const message = `La cliente a refusé le nouveau créneau proposé. Le rendez-vous initial reste inchangé.`;
    const [notifRows] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'booking_rescheduled', 'Report refusé', ?, ?)
       RETURNING id, created_at`,
      [request.pro_id, message, JSON.stringify({ reservation_id: request.reservation_id })]
    );
    const notif = (notifRows as any[])[0];
    if (notif) {
      await sendNotificationToUser(request.pro_id, {
        id: notif.id,
        type: "booking_rescheduled",
        title: "Report refusé",
        message,
        data: { reservation_id: request.reservation_id },
        created_at: notif.created_at,
      });
    }
  } catch (notifErr) {
    log.warn("[RESCHEDULE_DECLINE]", "Pro notification failed (non-fatal)", { requestId });
  }

  return { reservationId: request.reservation_id };
}
