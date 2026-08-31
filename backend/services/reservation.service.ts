/**
 * Création transactionnelle de réservations — chantier 3.3 / 3.4.
 *
 * Centralise la logique anti-double-booking aujourd'hui dupliquée dans
 * server.ts (POST /api/reservations ~L6546 et POST /api/pro/appointments
 * ~L4975) et alignée sur le pattern éprouvé de reschedule.service.ts :
 *
 *   lock advisory (pro_id) → re-check sous verrou → INSERT → notif post-commit
 *
 * Le verrou pg_advisory_xact_lock est pris sur (RESERVATION_LOCK_NS, pro_id)
 * pour éviter toute collision future avec un autre verrou consultatif au même
 * pro_id (cf. backend/lib/locks.ts). Il est libéré automatiquement au
 * COMMIT/ROLLBACK.
 *
 * 3.4 — ajout manuel pro : deux modes d'override audités
 *   - "outside_hours" : RDV hors horaires d'ouverture, avertissement simple,
 *     n'élargit PAS la disponibilité publique.
 *   - "conflict" : RDV forcé malgré un chevauchement, motif obligatoire, la
 *     période devient indisponible côté public (la réservation est bloquante).
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { sendNotificationToUser } from "../lib/notifications";
import { formatRdvWhen } from "../lib/notifyDate";
import { RESERVATION_LOCK_NS } from "../lib/locks";
import {
  checkSlotAvailability,
  findAlternativeSlots,
  type UnavailableReason,
  type AvailabilitySlot,
  type RequestedByRole,
} from "./availability.service";

const db = getDb();

export const SLOT_NO_LONGER_AVAILABLE = "SLOT_NO_LONGER_AVAILABLE";

export class ReservationServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ReservationServiceError";
  }
}

export type ManualOverrideMode = "outside_hours" | "conflict";

export interface ManualOverride {
  mode: ManualOverrideMode;
  /** Motif libre — obligatoire pour "conflict". */
  note?: string | null;
  overrideByUserId: number;
  /** RDV que la pro reconnaît impacter (mode "conflict"). */
  acknowledgedConflictReservationIds?: number[];
}

export interface CreateReservationInput {
  proId: number;
  clientId: number;
  serviceIds: number[];
  startDatetime: string; // instant ISO — départ visible du RDV
  requestedByRole: RequestedByRole;
  paidOnline?: boolean;
  earlyExecutionRequested?: boolean;
  bookingSource: "client" | "pro";
  manualOverride?: ManualOverride;
  timezone?: string;
  now?: Date;
}

export interface CreateReservationResult {
  reservationId: number;
  price: number;
  depositPercentage: number | null;
  depositAmount: number | null;
  overrideApplied: ManualOverrideMode | null;
}

interface WithLockDeps {
  beginTransaction: () => Promise<unknown>;
  commit: () => Promise<unknown>;
  rollback: () => Promise<unknown>;
  release: () => unknown;
  query: (sql: string, params?: any[]) => Promise<[any[], any[]]>;
  execute: (sql: string, params?: any[]) => Promise<[any[], any[]]>;
}

/**
 * Ouvre une transaction, prend le verrou consultatif de la pro, exécute `fn`,
 * commit — ou rollback sur erreur. Le verrou est TOUJOURS libéré (COMMIT ou
 * ROLLBACK libèrent un pg_advisory_xact_lock ; `finally` garantit le release
 * de la connexion même sur erreur inattendue).
 *
 * Extrait ici pour être partagé entre reservation.service et
 * reschedule.service (même pattern, aujourd'hui dupliqué).
 */
export async function withProReservationLock<T>(
  proId: number,
  fn: (conn: WithLockDeps) => Promise<T>
): Promise<T> {
  const connection = (await db.getConnection()) as unknown as WithLockDeps;
  try {
    await connection.beginTransaction();
    await connection.query(`SELECT pg_advisory_xact_lock(?, ?)`, [RESERVATION_LOCK_NS, proId]);
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

function reasonToError(reason: UnavailableReason | undefined, alternativeSlots: AvailabilitySlot[]): ReservationServiceError {
  switch (reason) {
    case "overlaps_reservation":
      return new ReservationServiceError(409, "Ce créneau vient d'être réservé.", SLOT_NO_LONGER_AVAILABLE, {
        alternativeSlots,
      });
    case "overlaps_unavailability":
      return new ReservationServiceError(409, "Ce créneau n'est plus disponible.", SLOT_NO_LONGER_AVAILABLE, {
        alternativeSlots,
      });
    case "outside_hours":
      return new ReservationServiceError(409, "Ce créneau est en dehors des horaires d'ouverture.", "OUTSIDE_WORKING_HOURS", {
        alternativeSlots,
      });
    case "before_lead_time":
      return new ReservationServiceError(422, "Ce créneau est trop proche pour être réservé.", "OUTSIDE_BOOKING_WINDOW");
    case "after_horizon":
      return new ReservationServiceError(422, "Ce créneau est trop loin dans le temps.", "OUTSIDE_BOOKING_WINDOW");
    default:
      return new ReservationServiceError(409, "Ce créneau n'est plus disponible.", SLOT_NO_LONGER_AVAILABLE, {
        alternativeSlots,
      });
  }
}

/** Vrai si l'override fourni couvre bien le motif de refus renvoyé par le moteur. */
function overrideCovers(mode: ManualOverrideMode, reason: UnavailableReason | undefined): boolean {
  if (mode === "outside_hours") return reason === "outside_hours";
  if (mode === "conflict") return reason === "overlaps_reservation" || reason === "overlaps_unavailability";
  return false;
}

export async function createReservation(input: CreateReservationInput): Promise<CreateReservationResult> {
  const now = input.now ?? new Date();

  if (input.manualOverride && input.requestedByRole !== "pro") {
    throw new ReservationServiceError(403, "Override réservé aux professionnels", "OVERRIDE_NOT_ALLOWED");
  }
  if (input.manualOverride?.mode === "conflict" && !input.manualOverride.note?.trim()) {
    throw new ReservationServiceError(422, "Un motif est obligatoire pour forcer un créneau en conflit", "OVERRIDE_REASON_REQUIRED");
  }

  // ── Prestation(s) : appartenance à la pro + prix serveur (jamais le body) ──
  const placeholders = input.serviceIds.map(() => "?").join(", ");
  const [serviceRows] = await db.query(
    `SELECT id, name, price,
            duration_minutes,
            COALESCE(buffer_before_minutes, 0) AS buffer_before_minutes,
            COALESCE(buffer_after_minutes, 0)  AS buffer_after_minutes,
            is_online_bookable
     FROM prestations WHERE pro_id = ? AND id IN (${placeholders})`,
    [input.proId, ...input.serviceIds]
  );
  const services = serviceRows as any[];
  if (services.length !== input.serviceIds.length) {
    throw new ReservationServiceError(422, "Prestation invalide pour ce professionnel", "SERVICE_NOT_BOOKABLE");
  }
  if (input.requestedByRole === "public" && services.some((s) => !s.is_online_bookable)) {
    throw new ReservationServiceError(422, "Cette prestation n'est pas réservable en ligne", "SERVICE_NOT_BOOKABLE");
  }
  const ordered = input.serviceIds.map((id) => services.find((s) => s.id === id));
  const primaryService = ordered[0];
  const price = ordered.reduce((sum, s) => sum + Number(s.price), 0);
  const prestationName: string = ordered.length === 1 ? primaryService.name : `${ordered.length} prestations`;

  // ── Cliente : bloquée ? ───────────────────────────────────────────────────
  const [blockedRows] = await db.query(
    `SELECT id FROM blocked_clients WHERE pro_id = ? AND client_id = ?`,
    [input.proId, input.clientId]
  );
  if ((blockedRows as any[]).length > 0) {
    throw new ReservationServiceError(
      403,
      input.bookingSource === "pro"
        ? "Cette cliente est bloquée. Débloque-la avant de lui créer un rendez-vous."
        : "Réservation impossible avec ce professionnel.",
      "CLIENT_BLOCKED"
    );
  }

  // ── 1. Pré-check optimiste hors transaction (court-circuit rapide) ─────────
  const preCheck = await checkSlotAvailability({
    proId: input.proId,
    serviceIds: input.serviceIds,
    startDatetime: input.startDatetime,
    timezone: input.timezone,
    requestedByRole: input.requestedByRole,
    now,
  });

  let overrideApplied: ManualOverrideMode | null = null;
  if (!preCheck.available) {
    const canOverride =
      input.requestedByRole === "pro" &&
      (preCheck.reason === "outside_hours" ||
        preCheck.reason === "overlaps_reservation" ||
        preCheck.reason === "overlaps_unavailability");

    if (!input.manualOverride) {
      if (canOverride) {
        const alt = await findAlternativeSlots({
          proId: input.proId,
          serviceIds: input.serviceIds,
          aroundDatetime: input.startDatetime,
          timezone: input.timezone,
          requestedByRole: input.requestedByRole,
          now,
        });
        const err = reasonToError(preCheck.reason, alt);
        err.extra = { ...(err.extra ?? {}), canOverride: true };
        throw err;
      }
      const alt =
        input.requestedByRole === "public"
          ? await findAlternativeSlots({
              proId: input.proId,
              serviceIds: input.serviceIds,
              aroundDatetime: input.startDatetime,
              timezone: input.timezone,
              requestedByRole: "public",
              now,
            })
          : [];
      throw reasonToError(preCheck.reason, alt);
    }

    // Un override est fourni : il doit correspondre au vrai motif de refus.
    if (!overrideCovers(input.manualOverride.mode, preCheck.reason)) {
      throw reasonToError(preCheck.reason, []);
    }
    overrideApplied = input.manualOverride.mode;
  }

  // ── Snapshot de calcul (figé, jamais recalculé) ──────────────────────────
  const snapshot = {
    serviceDurationMinutes: preCheck.serviceDurationMinutes,
    bufferBeforeMinutes: preCheck.bufferBeforeMinutes,
    bufferAfterMinutes: preCheck.bufferAfterMinutes,
    blockedStart: preCheck.blockedStart,
    blockedEnd: preCheck.blockedEnd,
    visibleEnd: preCheck.visibleEnd,
    timezone: input.timezone ?? null,
  };

  // ── Transaction : lock → re-check → INSERT → notif ───────────────────────
  const { reservationId, depositPercentage, depositAmount } = await withProReservationLock(
    input.proId,
    async (conn) => {
      // Re-check SOUS VERROU — l'état a pu changer depuis le pré-check.
      const recheck = await checkSlotAvailabilityOnConn(conn, {
        proId: input.proId,
        blockedStart: snapshot.blockedStart,
        blockedEnd: snapshot.blockedEnd,
      });

      if (!recheck.available && !overrideApplied) {
        const alt = await findAlternativeSlots({
          proId: input.proId,
          serviceIds: input.serviceIds,
          aroundDatetime: input.startDatetime,
          timezone: input.timezone,
          requestedByRole: input.requestedByRole,
          now,
        });
        // On lève : withProReservationLock fera le ROLLBACK.
        throw new ReservationServiceError(409, "Ce créneau vient d'être réservé.", SLOT_NO_LONGER_AVAILABLE, {
          alternativeSlots: alt,
        });
      }
      // Mode "conflict" : si le re-check ne trouve PLUS de conflit, ce n'est
      // plus un override — on insère normalement (overrideApplied repassé à null
      // pour ne pas polluer l'audit avec un faux override).
      if (recheck.available && overrideApplied === "conflict") {
        overrideApplied = null;
      }

      // Acompte pro.
      const [proRows] = await conn.query(
        `SELECT deposit_percentage, stripe_onboarding_complete FROM users WHERE id = ?`,
        [input.proId]
      );
      const proRow = (proRows as any[])[0];
      if (!proRow) throw new ReservationServiceError(404, "Professionnel introuvable", "PRO_NOT_FOUND");
      const depositPct: number | null = input.bookingSource === "pro" ? null : proRow.deposit_percentage ?? 50;
      const depositAmt: number | null =
        depositPct && depositPct > 0 ? Math.round(price * depositPct) / 100 : null;

      // Conflits reconnus (mode "conflict") — capturés SANS PII.
      let conflictsJson: string | null = null;
      if (overrideApplied === "conflict") {
        const [conflictRows] = await conn.query(
          `SELECT id FROM reservations
           WHERE pro_id = ? AND status NOT IN ('cancelled')
             AND blocked_start_datetime < ? AND blocked_end_datetime > ?`,
          [input.proId, snapshot.blockedEnd, snapshot.blockedStart]
        );
        conflictsJson = JSON.stringify({
          reservation_ids: (conflictRows as any[]).map((r) => r.id),
          captured_at: new Date().toISOString(),
        });
      }

      const overrideNote =
        overrideApplied === "conflict"
          ? input.manualOverride?.note?.trim() ?? null
          : overrideApplied === "outside_hours"
          ? input.manualOverride?.note?.trim() || null
          : null;
      const overrideBy = overrideApplied ? input.manualOverride?.overrideByUserId ?? null : null;
      const overrideAt = overrideApplied ? new Date() : null;

      const earlyExecAt = input.earlyExecutionRequested ? new Date() : null;

      const [resaRows] = await conn.execute(
        `INSERT INTO reservations (
           client_id, pro_id, prestation_id, start_datetime, end_datetime,
           status, price, payment_status, deposit_amount, paid_online, booking_source,
           service_duration_minutes, buffer_before_minutes, buffer_after_minutes,
           blocked_start_datetime, blocked_end_datetime, timezone,
           manual_override_reason, manual_override_by_user_id, manual_override_at,
           manual_override_note, manual_override_conflicts,
           early_execution_requested_at, created_at
         ) VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT timezone FROM users WHERE id = ?)), ?, ?, ?, ?, ?, ?, NOW())
         RETURNING id`,
        [
          input.clientId,
          input.proId,
          input.serviceIds[0],
          input.startDatetime,
          snapshot.visibleEnd,
          price,
          input.bookingSource === "pro" ? "paid_on_site" : "unpaid",
          depositAmt,
          input.paidOnline ?? false,
          input.bookingSource,
          snapshot.serviceDurationMinutes,
          snapshot.bufferBeforeMinutes,
          snapshot.bufferAfterMinutes,
          snapshot.blockedStart,
          snapshot.blockedEnd,
          snapshot.timezone,
          input.proId,
          overrideApplied,
          overrideBy,
          overrideAt,
          overrideNote,
          conflictsJson,
          earlyExecAt,
        ]
      );

      return {
        reservationId: (resaRows as any[])[0]?.id as number,
        depositPercentage: depositPct,
        depositAmount: depositAmt,
      };
    }
  );

  // ── Notification post-commit (best-effort) ──────────────────────────────
  await notifyAfterCreate({
    bookingSource: input.bookingSource,
    paidOnline: input.paidOnline ?? false,
    proId: input.proId,
    clientId: input.clientId,
    reservationId,
    prestationName,
    price,
    startDatetime: input.startDatetime,
    overrideApplied,
  }).catch((err) => log.warn("[RESERVATION_CREATE]", "notification failed (non-fatal)", { reservationId }));

  return { reservationId, price, depositPercentage, depositAmount, overrideApplied };
}

/** Re-check minimal sous verrou : chevauchement d'une réservation bloquante. */
async function checkSlotAvailabilityOnConn(
  conn: WithLockDeps,
  params: { proId: number; blockedStart: string; blockedEnd: string }
): Promise<{ available: boolean }> {
  const [rows] = await conn.query(
    `SELECT id FROM reservations
     WHERE pro_id = ?
       AND status NOT IN ('cancelled')
       AND blocked_start_datetime IS NOT NULL
       AND blocked_start_datetime < ?
       AND blocked_end_datetime   > ?`,
    [params.proId, params.blockedEnd, params.blockedStart]
  );
  return { available: (rows as any[]).length === 0 };
}

async function notifyAfterCreate(p: {
  bookingSource: "client" | "pro";
  paidOnline: boolean;
  proId: number;
  clientId: number;
  reservationId: number;
  prestationName: string;
  price: number;
  startDatetime: string;
  overrideApplied: ManualOverrideMode | null;
}) {
  const startAt = new Date(p.startDatetime);

  if (p.bookingSource === "pro") {
    const [proRows] = await db.query(`SELECT first_name, last_name FROM users WHERE id = ?`, [p.proId]);
    const pro = (proRows as any[])[0];
    const proName = pro ? `${pro.first_name} ${pro.last_name}` : "Ta pro";
    const message = `${proName} t'a réservé « ${p.prestationName} » le ${formatRdvWhen(startAt)}.`;
    const [notifRows] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'appointment_created_by_pro', 'Nouveau rendez-vous', ?, ?)
       RETURNING id, created_at`,
      [p.clientId, message, JSON.stringify({ reservation_id: p.reservationId, prestation: p.prestationName, price: p.price })]
    );
    const notif = (notifRows as any[])[0];
    if (notif) {
      await sendNotificationToUser(p.clientId, {
        id: notif.id,
        type: "appointment_created_by_pro",
        title: "Nouveau rendez-vous",
        message,
        data: { reservation_id: p.reservationId },
        created_at: notif.created_at,
      });
    }
    return;
  }

  // bookingSource "client" : notif pro, sauf paiement en ligne (traité au webhook).
  if (p.paidOnline) return;
  const [clientRows] = await db.query(`SELECT first_name, last_name FROM users WHERE id = ?`, [p.clientId]);
  const client = (clientRows as any[])[0];
  const clientName = client ? `${client.first_name} ${client.last_name}` : "Un client";
  const message = `${clientName} a réservé « ${p.prestationName} » le ${formatRdvWhen(startAt)}.`;
  const [notifRows] = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES (?, 'new_booking', 'Nouveau rendez-vous', ?, ?)
     RETURNING id, created_at`,
    [p.proId, message, JSON.stringify({ reservation_id: p.reservationId, prestation: p.prestationName, price: p.price })]
  );
  const notif = (notifRows as any[])[0];
  if (notif) {
    await sendNotificationToUser(p.proId, {
      id: notif.id,
      type: "new_booking",
      title: "Nouveau rendez-vous",
      message,
      data: { reservation_id: p.reservationId },
      created_at: notif.created_at,
    });
  }
}
