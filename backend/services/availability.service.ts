/**
 * Moteur de disponibilités — calcul côté serveur (chantier 3.2).
 *
 * Remplace la logique aujourd'hui portée par le mobile (lib/api.ts +
 * calendar.tsx généraient les créneaux depuis `duration_minutes`). Le backend
 * devient la SEULE autorité sur « quand peut-on réserver ».
 *
 * Deux fonctions publiques :
 *   - getAvailability()        → liste de créneaux de départ possibles sur une plage
 *   - checkSlotAvailability()  → un départ précis est-il réservable ? sinon pourquoi ?
 *
 * Les deux partagent EXACTEMENT les mêmes règles via computeFreeBlocks() : un
 * créneau affiché comme disponible ne doit jamais être refusé à la confirmation.
 *
 * Fuseau : tout le calcul se fait dans le fuseau de la pro (luxon, DST-correct)
 * puis est sérialisé en instants ISO / TIMESTAMPTZ. Aucune arithmétique sur des
 * chaînes locales naïves.
 */

import { DateTime, Interval } from "luxon";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const db = getDb();

export const DEFAULT_LEAD_TIME_MINUTES = 120;
export const DEFAULT_HORIZON_DAYS = 60;
export const DEFAULT_SLOT_STEP_MINUTES = 15;
export const DEFAULT_TIMEZONE = "Europe/Paris";

export type RequestedByRole = "public" | "pro";

export type UnavailableReason =
  | "outside_hours"
  | "overlaps_reservation"
  | "overlaps_unavailability"
  | "before_lead_time"
  | "after_horizon"
  | "unknown_service"
  | "service_not_bookable";

export interface GetAvailabilityInput {
  proId: number;
  serviceIds: number[];
  fromDate: string; // "YYYY-MM-DD" (dans le fuseau de la pro)
  toDate: string; // "YYYY-MM-DD" inclus
  timezone?: string;
  slotStepMinutes?: number;
  requestedByRole: RequestedByRole;
  now?: Date; // injectable pour les tests
}

export interface AvailabilitySlot {
  start: string; // instant ISO (départ visible du RDV)
  end: string; // instant ISO (fin visible du RDV)
}

export interface AvailabilityResponse {
  timezone: string;
  requested_duration_minutes: number;
  total_blocked_minutes: number;
  days: Array<{ date: string; slots: AvailabilitySlot[] }>;
}

export interface CheckSlotInput {
  proId: number;
  serviceIds: number[];
  startDatetime: string; // instant ISO
  timezone?: string;
  excludeReservationId?: number;
  requestedByRole: RequestedByRole;
  now?: Date;
}

export interface CheckSlotResult {
  available: boolean;
  reason?: UnavailableReason;
  /** Instant ISO — début de la période réellement bloquée (buffer avant inclus). */
  blockedStart: string;
  /** Instant ISO — fin de la période réellement bloquée (buffer après inclus). */
  blockedEnd: string;
  /** Fin visible du RDV (sans buffer après) — utile pour l'affichage. */
  visibleEnd: string;
  serviceDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export class AvailabilityError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AvailabilityError";
  }
}

// ── Types internes ──────────────────────────────────────────────────────────

interface ServiceBlocking {
  /** Σ durées + tampons internes entre prestations (= durée « visible » du RDV). */
  serviceDurationMinutes: number;
  /** Tampon avant la 1ʳᵉ prestation. */
  bufferBeforeMinutes: number;
  /** Tampon après la dernière prestation. */
  bufferAfterMinutes: number;
  /** Span total réellement bloqué = before + duration + after. */
  totalBlockedMinutes: number;
}

interface EffectiveLimits {
  leadTimeMinutes: number;
  horizonDays: number;
}

interface WorkingHourRow {
  weekday: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

interface UnavailabilityRow {
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface BlockedReservationRow {
  id: number;
  blocked_start_datetime: string;
  blocked_end_datetime: string;
}

// ── Chargement des données pro ──────────────────────────────────────────────

interface ProContext {
  timezone: string;
  services: Array<{
    id: number;
    duration_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    booking_lead_time_minutes: number | null;
    booking_horizon_days: number | null;
    is_online_bookable: boolean;
  }>;
  defaultLeadTimeMinutes: number | null;
  defaultHorizonDays: number | null;
  workingHours: WorkingHourRow[];
}

async function loadProContext(
  proId: number,
  serviceIds: number[],
  timezoneOverride: string | undefined,
  role: RequestedByRole
): Promise<ProContext> {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new AvailabilityError(422, "Au moins une prestation est requise", "INVALID_INPUT");
  }

  // Flow public : une pro désactivée, suspendue ou en profil privé ne doit pas
  // exposer ses horaires ni ses créneaux occupés/libres à un appelant anonyme
  // (cf. revue sécurité — parité avec GET /api/slots/available/:proId/:date).
  // Flow "pro" : aucun filtre — une pro voit toujours son propre planning, même
  // compte désactivé (l'ownership est déjà vérifié en amont sur la route).
  const publicGate =
    role === "public"
      ? "AND pro_status = 'active' AND is_active = TRUE AND (profile_visibility = 'public' OR profile_visibility IS NULL)"
      : "";
  const [proRows] = await db.query(
    `SELECT id, timezone, default_booking_lead_time_minutes, default_booking_horizon_days
     FROM users WHERE id = ? AND role = 'pro' ${publicGate}`,
    [proId]
  );
  const pro = (proRows as any[])[0];
  if (!pro) {
    throw new AvailabilityError(404, "Professionnel introuvable", "PRO_NOT_FOUND");
  }

  const placeholders = serviceIds.map(() => "?").join(", ");
  const [serviceRows] = await db.query(
    `SELECT id, duration_minutes,
            COALESCE(buffer_before_minutes, 0) AS buffer_before_minutes,
            COALESCE(buffer_after_minutes, 0)  AS buffer_after_minutes,
            booking_lead_time_minutes, booking_horizon_days, is_online_bookable
     FROM prestations
     WHERE pro_id = ? AND id IN (${placeholders})`,
    [proId, ...serviceIds]
  );
  const services = serviceRows as ProContext["services"];

  if (services.length !== serviceIds.length) {
    throw new AvailabilityError(422, "Prestation inconnue pour ce professionnel", "UNKNOWN_SERVICE");
  }
  // Le flow public n'expose que les prestations réservables en ligne. La pro
  // peut réserver n'importe laquelle de ses prestations (ajout manuel).
  if (role === "public" && services.some((s) => !s.is_online_bookable)) {
    throw new AvailabilityError(422, "Cette prestation n'est pas réservable en ligne", "SERVICE_NOT_BOOKABLE");
  }

  const [whRows] = await db.query(
    `SELECT weekday, TO_CHAR(start_time, 'HH24:MI:SS') AS start_time,
            TO_CHAR(end_time, 'HH24:MI:SS') AS end_time
     FROM working_hours WHERE pro_id = ? ORDER BY weekday, start_time`,
    [proId]
  );

  // Préserve l'ordre demandé par l'appelant (buffer avant = 1ʳᵉ, après = dernière).
  const orderedServices = serviceIds.map((id) => services.find((s) => s.id === id)!);

  return {
    timezone: timezoneOverride || pro.timezone || DEFAULT_TIMEZONE,
    services: orderedServices,
    defaultLeadTimeMinutes: pro.default_booking_lead_time_minutes ?? null,
    defaultHorizonDays: pro.default_booking_horizon_days ?? null,
    workingHours: whRows as WorkingHourRow[],
  };
}

// ── Règles partagées ───────────────────────────────────────────────────────

/**
 * Règle additive (design 3.2) : chaque prestation apporte ses deux tampons
 * intégralement, cumulés bout à bout — pas de fusion / max(). Le RDV « visible »
 * pour la cliente va du début de la 1ʳᵉ prestation à la fin de la dernière ;
 * la période réellement bloquée ajoute le tampon avant et le tampon après.
 */
export function resolveServiceBlocking(services: ProContext["services"]): ServiceBlocking {
  const bufferBeforeMinutes = services[0].buffer_before_minutes;
  const bufferAfterMinutes = services[services.length - 1].buffer_after_minutes;

  let visible = 0;
  services.forEach((s, i) => {
    visible += s.duration_minutes;
    if (i > 0) visible += s.buffer_before_minutes; // tampon avant d'une prestation intermédiaire
    if (i < services.length - 1) visible += s.buffer_after_minutes; // tampon après d'une prestation intermédiaire
  });

  return {
    serviceDurationMinutes: visible,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    totalBlockedMinutes: bufferBeforeMinutes + visible + bufferAfterMinutes,
  };
}

/** effectiveLeadTime = prestation ?? pro ?? défaut (idem horizon). */
export function resolveEffectiveLimits(ctx: ProContext): EffectiveLimits {
  // Sur plusieurs prestations : on prend la contrainte la plus stricte.
  const leadCandidates = ctx.services
    .map((s) => s.booking_lead_time_minutes)
    .filter((v): v is number => v != null);
  const horizonCandidates = ctx.services
    .map((s) => s.booking_horizon_days)
    .filter((v): v is number => v != null);

  const leadTimeMinutes = leadCandidates.length
    ? Math.max(...leadCandidates)
    : ctx.defaultLeadTimeMinutes ?? DEFAULT_LEAD_TIME_MINUTES;
  const horizonDays = horizonCandidates.length
    ? Math.min(...horizonCandidates)
    : ctx.defaultHorizonDays ?? DEFAULT_HORIZON_DAYS;

  return { leadTimeMinutes, horizonDays };
}

function parseHms(hms: string): { hour: number; minute: number } {
  const [h, m] = hms.split(":").map(Number);
  return { hour: h, minute: m };
}

/**
 * Intervalles libres d'une pro sur une plage de jours, dans son fuseau.
 * = working_hours − unavailabilities − reservations bloquantes.
 * Cœur partagé entre getAvailability et checkSlotAvailability.
 */
function computeFreeBlocks(params: {
  timezone: string;
  fromDate: string;
  toDate: string;
  workingHours: WorkingHourRow[];
  unavailabilities: UnavailabilityRow[];
  blockedReservations: BlockedReservationRow[];
}): Interval[] {
  const { timezone, fromDate, toDate, workingHours, unavailabilities, blockedReservations } = params;

  const firstDay = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  const lastDay = DateTime.fromISO(toDate, { zone: timezone }).startOf("day");
  if (!firstDay.isValid || !lastDay.isValid) {
    throw new AvailabilityError(422, "Plage de dates invalide", "INVALID_INPUT");
  }

  let open: Interval[] = [];

  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    const weekday = day.weekday % 7; // luxon: 1=lundi..7=dimanche → 0=dimanche..6=samedi
    const isoDate = day.toISODate()!;

    const dayWindows = workingHours.filter((w) => w.weekday === weekday);
    for (const w of dayWindows) {
      const s = parseHms(w.start_time);
      const e = parseHms(w.end_time);
      // set() résout correctement les transitions DST (jour de 23h/25h).
      const startDt = day.set({ hour: s.hour, minute: s.minute, second: 0, millisecond: 0 });
      const endDt = day.set({ hour: e.hour, minute: e.minute, second: 0, millisecond: 0 });
      const itv = Interval.fromDateTimes(startDt, endDt);
      if (itv.isValid && itv.length("minutes") > 0) open.push(itv);
    }
  }

  if (open.length === 0) return [];

  // Soustraire les indisponibilités.
  const blockingIntervals: Interval[] = [];

  for (const u of unavailabilities) {
    if (u.start_time && u.end_time) {
      // Ponctuelle (une seule journée garantie par la contrainte SQL).
      const day = DateTime.fromISO(u.start_date, { zone: timezone }).startOf("day");
      const s = parseHms(u.start_time);
      const e = parseHms(u.end_time);
      const itv = Interval.fromDateTimes(
        day.set({ hour: s.hour, minute: s.minute }),
        day.set({ hour: e.hour, minute: e.minute })
      );
      if (itv.isValid) blockingIntervals.push(itv);
    } else {
      // Journée(s) entière(s).
      const start = DateTime.fromISO(u.start_date, { zone: timezone }).startOf("day");
      const end = DateTime.fromISO(u.end_date, { zone: timezone }).plus({ days: 1 }).startOf("day");
      const itv = Interval.fromDateTimes(start, end);
      if (itv.isValid) blockingIntervals.push(itv);
    }
  }

  for (const r of blockedReservations) {
    const itv = Interval.fromDateTimes(
      DateTime.fromISO(r.blocked_start_datetime, { zone: timezone }),
      DateTime.fromISO(r.blocked_end_datetime, { zone: timezone })
    );
    if (itv.isValid) blockingIntervals.push(itv);
  }

  if (blockingIntervals.length === 0) {
    return Interval.merge(open);
  }

  // open − blocking
  let free: Interval<boolean>[] = Interval.merge(open);
  for (const b of blockingIntervals) {
    const next: Interval<boolean>[] = [];
    for (const f of free) {
      next.push(...f.difference(b));
    }
    free = next;
  }
  return free.filter((i) => i.isValid && i.length("minutes") > 0);
}

async function loadBlockingInputs(
  proId: number,
  timezone: string,
  fromDate: string,
  toDate: string,
  excludeReservationId?: number
): Promise<{ unavailabilities: UnavailabilityRow[]; blockedReservations: BlockedReservationRow[] }> {
  const rangeStart = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day").toUTC().toISO();
  const rangeEnd = DateTime.fromISO(toDate, { zone: timezone }).plus({ days: 1 }).startOf("day").toUTC().toISO();

  const [unavailRows] = await db.query(
    `SELECT TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
            TO_CHAR(end_date, 'YYYY-MM-DD')   AS end_date,
            TO_CHAR(start_time, 'HH24:MI:SS') AS start_time,
            TO_CHAR(end_time, 'HH24:MI:SS')   AS end_time
     FROM unavailabilities
     WHERE pro_id = ?
       AND start_date <= ?::date
       AND end_date   >= ?::date`,
    [proId, toDate, fromDate]
  );

  const [resaRows] = await db.query(
    `SELECT id, blocked_start_datetime, blocked_end_datetime
     FROM reservations
     WHERE pro_id = ?
       AND status NOT IN ('cancelled')
       AND blocked_start_datetime IS NOT NULL
       AND blocked_start_datetime < ?
       AND blocked_end_datetime   > ?
       ${excludeReservationId ? "AND id <> ?" : ""}`,
    excludeReservationId
      ? [proId, rangeEnd, rangeStart, excludeReservationId]
      : [proId, rangeEnd, rangeStart]
  );

  return {
    unavailabilities: unavailRows as UnavailabilityRow[],
    blockedReservations: resaRows as BlockedReservationRow[],
  };
}

// ── API publique : getAvailability ─────────────────────────────────────────

export async function getAvailability(input: GetAvailabilityInput): Promise<AvailabilityResponse> {
  const now = input.now ?? new Date();
  const step = input.slotStepMinutes ?? DEFAULT_SLOT_STEP_MINUTES;
  if (step <= 0 || step > 240) {
    throw new AvailabilityError(422, "Pas de créneau invalide", "INVALID_INPUT");
  }

  const ctx = await loadProContext(input.proId, input.serviceIds, input.timezone, input.requestedByRole);
  const tz = ctx.timezone;
  const blocking = resolveServiceBlocking(ctx.services);
  const limits = resolveEffectiveLimits(ctx);

  const { unavailabilities, blockedReservations } = await loadBlockingInputs(
    input.proId,
    tz,
    input.fromDate,
    input.toDate
  );

  const free = computeFreeBlocks({
    timezone: tz,
    fromDate: input.fromDate,
    toDate: input.toDate,
    workingHours: ctx.workingHours,
    unavailabilities,
    blockedReservations,
  });

  const nowDt = DateTime.fromJSDate(now, { zone: tz });
  // Le flow public borne par lead-time / horizon ; la pro (ajout manuel) n'est
  // bornée que par « dans le futur ».
  const earliestStart =
    input.requestedByRole === "public"
      ? nowDt.plus({ minutes: limits.leadTimeMinutes })
      : nowDt;
  const latestStart =
    input.requestedByRole === "public"
      ? nowDt.plus({ days: limits.horizonDays })
      : nowDt.plus({ years: 2 });

  const byDate = new Map<string, AvailabilitySlot[]>();

  for (const interval of free) {
    // La période RÉELLEMENT bloquée [start - bufferBefore, start + duration + bufferAfter]
    // doit tenir dans l'intervalle libre. Donc le premier départ possible est
    // interval.start + bufferBefore.
    let candidateStart = interval.start!.plus({ minutes: blocking.bufferBeforeMinutes });
    const lastPossibleStart = interval.end!.minus({
      minutes: blocking.serviceDurationMinutes + blocking.bufferAfterMinutes,
    });

    // Aligne le départ sur le pas depuis le début de l'intervalle libre.
    while (candidateStart <= lastPossibleStart) {
      if (candidateStart >= earliestStart && candidateStart <= latestStart) {
        const visibleEnd = candidateStart.plus({ minutes: blocking.serviceDurationMinutes });
        const isoDate = candidateStart.toISODate()!;
        if (!byDate.has(isoDate)) byDate.set(isoDate, []);
        byDate.get(isoDate)!.push({
          start: candidateStart.toUTC().toISO()!,
          end: visibleEnd.toUTC().toISO()!,
        });
      }
      candidateStart = candidateStart.plus({ minutes: step });
    }
  }

  // Émet un jour par date de la plage (même vide) pour un contrat stable côté mobile.
  const days: AvailabilityResponse["days"] = [];
  let d = DateTime.fromISO(input.fromDate, { zone: tz }).startOf("day");
  const last = DateTime.fromISO(input.toDate, { zone: tz }).startOf("day");
  for (; d <= last; d = d.plus({ days: 1 })) {
    const isoDate = d.toISODate()!;
    days.push({ date: isoDate, slots: byDate.get(isoDate) ?? [] });
  }

  return {
    timezone: tz,
    requested_duration_minutes: blocking.serviceDurationMinutes,
    total_blocked_minutes: blocking.totalBlockedMinutes,
    days,
  };
}

// ── API publique : checkSlotAvailability ───────────────────────────────────

export async function checkSlotAvailability(input: CheckSlotInput): Promise<CheckSlotResult> {
  const now = input.now ?? new Date();
  const ctx = await loadProContext(input.proId, input.serviceIds, input.timezone, input.requestedByRole);
  const tz = ctx.timezone;
  const blocking = resolveServiceBlocking(ctx.services);
  const limits = resolveEffectiveLimits(ctx);

  const startDt = DateTime.fromISO(input.startDatetime, { zone: tz });
  if (!startDt.isValid) {
    throw new AvailabilityError(422, "Date de départ invalide", "INVALID_INPUT");
  }
  const visibleEndDt = startDt.plus({ minutes: blocking.serviceDurationMinutes });
  const blockedStartDt = startDt.minus({ minutes: blocking.bufferBeforeMinutes });
  const blockedEndDt = visibleEndDt.plus({ minutes: blocking.bufferAfterMinutes });

  const base = {
    blockedStart: blockedStartDt.toUTC().toISO()!,
    blockedEnd: blockedEndDt.toUTC().toISO()!,
    visibleEnd: visibleEndDt.toUTC().toISO()!,
    serviceDurationMinutes: blocking.serviceDurationMinutes,
    bufferBeforeMinutes: blocking.bufferBeforeMinutes,
    bufferAfterMinutes: blocking.bufferAfterMinutes,
  };

  const nowDt = DateTime.fromJSDate(now, { zone: tz });

  // 1. Fenêtre de réservation (public uniquement).
  if (input.requestedByRole === "public") {
    if (startDt < nowDt.plus({ minutes: limits.leadTimeMinutes })) {
      return { available: false, reason: "before_lead_time", ...base };
    }
    if (startDt > nowDt.plus({ days: limits.horizonDays })) {
      return { available: false, reason: "after_horizon", ...base };
    }
  } else if (startDt <= nowDt) {
    return { available: false, reason: "before_lead_time", ...base };
  }

  const dayIso = blockedStartDt.toISODate()!;
  const endDayIso = blockedEndDt.toISODate()!;

  const { unavailabilities, blockedReservations } = await loadBlockingInputs(
    input.proId,
    tz,
    dayIso,
    endDayIso,
    input.excludeReservationId
  );

  const blockedItv = Interval.fromDateTimes(blockedStartDt, blockedEndDt);

  // 2. Horaires d'ouverture (working_hours seulement, sans les autres soustractions).
  // Rétrocompatibilité bascule : tant qu'une pro n'a pas configuré ses
  // working_hours, on N'ENFORCE PAS les horaires (comportement legacy : seul le
  // chevauchement d'un autre RDV bloque). Sans ce garde-fou, tout RDV serait
  // refusé "outside_hours" pour les pros pas encore migrées.
  if (ctx.workingHours.length > 0) {
    const openOnly = computeFreeBlocks({
      timezone: tz,
      fromDate: dayIso,
      toDate: endDayIso,
      workingHours: ctx.workingHours,
      unavailabilities: [],
      blockedReservations: [],
    });
    const withinHours = openOnly.some((f) => f.engulfs(blockedItv));
    if (!withinHours) {
      return { available: false, reason: "outside_hours", ...base };
    }
  }

  // 3. Indisponibilités ponctuelles / journée — chevauchement direct
  //    (indépendant des working_hours pour rester valable en mode legacy).
  const overlapsUnavail = unavailabilities.some((u) => {
    let itv: Interval<boolean>;
    if (u.start_time && u.end_time) {
      const day = DateTime.fromISO(u.start_date, { zone: tz }).startOf("day");
      const [sh, sm] = u.start_time.split(":").map(Number);
      const [eh, em] = u.end_time.split(":").map(Number);
      itv = Interval.fromDateTimes(day.set({ hour: sh, minute: sm }), day.set({ hour: eh, minute: em }));
    } else {
      itv = Interval.fromDateTimes(
        DateTime.fromISO(u.start_date, { zone: tz }).startOf("day"),
        DateTime.fromISO(u.end_date, { zone: tz }).plus({ days: 1 }).startOf("day")
      );
    }
    return itv.isValid && itv.overlaps(blockedItv);
  });
  if (overlapsUnavail) {
    return { available: false, reason: "overlaps_unavailability", ...base };
  }

  // 4. Réservations bloquantes.
  const overlaps = blockedReservations.some((r) => {
    const itv = Interval.fromDateTimes(
      DateTime.fromISO(r.blocked_start_datetime, { zone: tz }),
      DateTime.fromISO(r.blocked_end_datetime, { zone: tz })
    );
    return itv.isValid && itv.overlaps(blockedItv);
  });
  if (overlaps) {
    return { available: false, reason: "overlaps_reservation", ...base };
  }

  return { available: true, ...base };
}

/**
 * Propose jusqu'à `limit` créneaux alternatifs autour d'un départ refusé.
 * Best-effort : borné en temps par l'appelant, renvoie [] en cas d'échec.
 */
export async function findAlternativeSlots(params: {
  proId: number;
  serviceIds: number[];
  aroundDatetime: string;
  timezone?: string;
  requestedByRole: RequestedByRole;
  limit?: number;
  now?: Date;
}): Promise<AvailabilitySlot[]> {
  const limit = params.limit ?? 3;
  try {
    const around = DateTime.fromISO(params.aroundDatetime);
    const fromDate = around.toISODate()!;
    const toDate = around.plus({ days: 7 }).toISODate()!;
    const avail = await getAvailability({
      proId: params.proId,
      serviceIds: params.serviceIds,
      fromDate,
      toDate,
      timezone: params.timezone,
      requestedByRole: params.requestedByRole,
      now: params.now,
    });
    const all = avail.days.flatMap((d) => d.slots);
    return all
      .map((s) => ({ slot: s, dist: Math.abs(DateTime.fromISO(s.start).toMillis() - around.toMillis()) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((x) => x.slot);
  } catch (err) {
    log.warn("[AVAILABILITY]", "findAlternativeSlots failed (non-fatal)", {
      proId: params.proId,
    });
    return [];
  }
}
