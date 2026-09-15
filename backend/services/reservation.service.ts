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
import { computeItemPricing, computeReservationTotals, sortByOrderingRank, PricingError } from "./pricing-engine";

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

export interface ReservationAnswerInput {
  questionId: number;
  /** short_text / long_text / boolean — valeur brute. */
  value?: string;
  /** single_choice (1 élément) / multi_choice (0..N) — ids de question_choices. */
  values?: number[];
  /** Consentement explicite requis si la question est marquée sensible (doc §9.2). */
  consent?: boolean;
}

/**
 * Un élément du panier (doc §2, §13.3) — une prestation avec sa propre
 * configuration. V1 exposait un seul élément (`serviceIds.length === 1`
 * implicite) ; V3 généralise à N éléments SANS changer la structure : une
 * réservation à 1 élément suit exactement le même chemin de code qu'à N.
 * Deux occurrences de la MÊME prestation (`prestationId` identique) sont
 * autorisées et restent deux éléments distincts, chacun avec sa propre
 * configuration — jamais fusionnées.
 */
export interface ReservationItemInput {
  prestationId: number;
  selectedVariantValueIds?: number[];
  selectedOptionIds?: number[];
  answers?: ReservationAnswerInput[];
}

export interface CreateReservationInput {
  proId: number;
  clientId: number;
  /** Panier — 1..N prestations, chacune avec sa propre configuration (doc §2). */
  items: ReservationItemInput[];
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

interface ResolvedVariantValue {
  id: number;
  variant_group_id: number;
  group_name: string;
  label: string;
  price_delta: number;
  duration_delta: number;
}

interface ResolvedOption {
  id: number;
  name: string;
  price_delta: number;
  duration_delta: number;
}

/**
 * Valide une sélection de variantes/options pour UNE prestation : les
 * valeurs/options doivent être actives et appartenir à cette prestation, un
 * groupe requis actif doit avoir exactement une valeur sélectionnée, aucun
 * groupe ne peut recevoir deux valeurs (doc §5.3, §18). Les doublons
 * d'options sont dédoublonnés silencieusement (doc §18, décision verrouillée).
 */
async function resolveConfigSelection(
  prestationId: number,
  selectedVariantValueIds: number[],
  selectedOptionIds: number[]
): Promise<{ variantValues: ResolvedVariantValue[]; options: ResolvedOption[] }> {
  const [groupRows] = await db.query(
    `SELECT id, name, required FROM variant_groups WHERE prestation_id = ? AND active = TRUE`,
    [prestationId]
  );
  const groups = groupRows as Array<{ id: number; name: string; required: boolean }>;

  const dedupedVariantIds = [...new Set(selectedVariantValueIds)];
  let variantValues: ResolvedVariantValue[] = [];
  if (dedupedVariantIds.length > 0) {
    const placeholders = dedupedVariantIds.map(() => "?").join(", ");
    const [valueRows] = await db.query(
      `SELECT vv.id, vv.variant_group_id, vg.name AS group_name, vv.label, vv.price_delta, vv.duration_delta
       FROM variant_values vv
       JOIN variant_groups vg ON vg.id = vv.variant_group_id
       WHERE vv.id IN (${placeholders}) AND vv.active = TRUE AND vg.active = TRUE AND vg.prestation_id = ?`,
      [...dedupedVariantIds, prestationId]
    );
    variantValues = valueRows as ResolvedVariantValue[];
    if (variantValues.length !== dedupedVariantIds.length) {
      throw new ReservationServiceError(422, "Une des valeurs sélectionnées n'est plus disponible.", "VARIANT_VALUE_INVALID");
    }
  }

  const byGroup = new Map<number, ResolvedVariantValue[]>();
  for (const v of variantValues) {
    const arr = byGroup.get(v.variant_group_id) ?? [];
    arr.push(v);
    byGroup.set(v.variant_group_id, arr);
  }
  for (const [, values] of byGroup) {
    if (values.length > 1) {
      throw new ReservationServiceError(422, "Une seule valeur peut être sélectionnée par groupe.", "VARIANT_GROUP_MULTIPLE_VALUES");
    }
  }
  for (const group of groups) {
    if (group.required && !byGroup.has(group.id)) {
      throw new ReservationServiceError(422, `Le choix « ${group.name} » est requis.`, "VARIANT_GROUP_REQUIRED");
    }
  }

  const dedupedOptionIds = [...new Set(selectedOptionIds)];
  let options: ResolvedOption[] = [];
  if (dedupedOptionIds.length > 0) {
    const placeholders = dedupedOptionIds.map(() => "?").join(", ");
    const [optionRows] = await db.query(
      `SELECT id, name, price_delta, duration_delta FROM options
       WHERE id IN (${placeholders}) AND active = TRUE AND prestation_id = ?`,
      [...dedupedOptionIds, prestationId]
    );
    options = optionRows as ResolvedOption[];
    if (options.length !== dedupedOptionIds.length) {
      throw new ReservationServiceError(422, "Une des options sélectionnées n'est plus disponible.", "OPTION_INVALID");
    }
  }

  return { variantValues, options };
}

interface ResolvedAnswer {
  questionId: number;
  label: string;
  type: string;
  isSensitive: boolean;
  choicesAvailable: string[] | null;
  answerValue: string | null;
  answerValues: string[] | null;
}

/**
 * Valide et résout les réponses aux questions personnalisées d'UNE
 * prestation (doc §9, §13.2) : toute question active requise doit être
 * répondue, le consentement explicite est exigé pour une question active
 * sensible, et le format de réponse doit correspondre au type réel de la
 * question en base (jamais fait confiance au type supposé côté client).
 * N'a AUCUN effet sur le prix/la durée — décision verrouillée du chantier V2.
 */
async function resolveAnswers(prestationId: number, answers: ReservationAnswerInput[]): Promise<ResolvedAnswer[]> {
  const [questionRows] = await db.query(
    `SELECT id, label, type, required, is_sensitive FROM questions WHERE prestation_id = ? AND active = TRUE`,
    [prestationId]
  );
  const questions = questionRows as Array<{ id: number; label: string; type: string; required: boolean; is_sensitive: boolean }>;
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answeredIds = new Set(answers.map((a) => a.questionId));

  for (const q of questions) {
    if (q.required && !answeredIds.has(q.id)) {
      throw new ReservationServiceError(422, `La question « ${q.label} » est requise.`, "QUESTION_REQUIRED");
    }
  }

  const resolved: ResolvedAnswer[] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) {
      throw new ReservationServiceError(422, "Une des questions n'est plus disponible.", "QUESTION_INVALID");
    }
    if (q.is_sensitive && !a.consent) {
      throw new ReservationServiceError(
        422,
        `Un consentement explicite est requis pour répondre à « ${q.label} ».`,
        "SENSITIVE_CONSENT_REQUIRED"
      );
    }

    let choicesAvailable: string[] | null = null;
    let answerValue: string | null = null;
    let answerValues: string[] | null = null;

    if (q.type === "single_choice" || q.type === "multi_choice") {
      const [choiceRows] = await db.query(`SELECT id, label FROM question_choices WHERE question_id = ?`, [q.id]);
      const choices = choiceRows as Array<{ id: number; label: string }>;
      choicesAvailable = choices.map((c) => c.label);

      if (q.type === "single_choice") {
        const chosenId = a.values?.[0];
        const choice = chosenId != null ? choices.find((c) => c.id === chosenId) : undefined;
        if (!choice) {
          throw new ReservationServiceError(422, `Réponse invalide pour « ${q.label} ».`, "QUESTION_ANSWER_INVALID");
        }
        // snapshot du LIBELLÉ (jamais l'id) — même principe que
        // snapshot_value_label sur les variantes V1 : lisible sans jointure,
        // insensible à un renommage/suppression ultérieur du choix.
        answerValue = choice.label;
      } else {
        const dedupedIds = [...new Set(a.values ?? [])];
        if (q.required && dedupedIds.length === 0) {
          throw new ReservationServiceError(422, `La question « ${q.label} » est requise.`, "QUESTION_REQUIRED");
        }
        const labels: string[] = [];
        for (const id of dedupedIds) {
          const choice = choices.find((c) => c.id === id);
          if (!choice) {
            throw new ReservationServiceError(422, `Réponse invalide pour « ${q.label} ».`, "QUESTION_ANSWER_INVALID");
          }
          labels.push(choice.label);
        }
        answerValues = labels.length > 0 ? labels : null;
      }
    } else if (q.type === "boolean") {
      if (a.value !== "true" && a.value !== "false") {
        throw new ReservationServiceError(422, `Réponse invalide pour « ${q.label} ».`, "QUESTION_ANSWER_INVALID");
      }
      answerValue = a.value;
    } else {
      // short_text / long_text
      const text = (a.value ?? "").trim();
      if (q.required && text.length === 0) {
        throw new ReservationServiceError(422, `La question « ${q.label} » est requise.`, "QUESTION_REQUIRED");
      }
      answerValue = text.length > 0 ? text : null;
    }

    resolved.push({
      questionId: q.id,
      label: q.label,
      type: q.type,
      isSensitive: q.is_sensitive,
      choicesAvailable,
      answerValue,
      answerValues,
    });
  }

  return resolved;
}

interface ResolvedItem {
  prestationId: number;
  name: string;
  orderingRank: number;
  price: number;
  durationMinutes: number;
  variants: ResolvedVariantValue[];
  options: ResolvedOption[];
  answers: ResolvedAnswer[];
}

export async function createReservation(input: CreateReservationInput): Promise<CreateReservationResult> {
  const now = input.now ?? new Date();

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ReservationServiceError(422, "Au moins une prestation est requise", "NO_ITEMS");
  }
  if (input.manualOverride && input.requestedByRole !== "pro") {
    throw new ReservationServiceError(403, "Override réservé aux professionnels", "OVERRIDE_NOT_ALLOWED");
  }
  if (input.manualOverride?.mode === "conflict" && !input.manualOverride.note?.trim()) {
    throw new ReservationServiceError(422, "Un motif est obligatoire pour forcer un créneau en conflit", "OVERRIDE_REASON_REQUIRED");
  }

  // ── Prestations : appartenance à la pro + prix serveur (jamais le body) ────
  // active = TRUE : une prestation désactivée par la pro ("masquée, non
  // réservable" — service-form.tsx) ne doit jamais être réservable, que l'ID
  // provienne du parcours normal ou soit connu/deviné directement (trouvé en
  // recette fonctionnelle V1). IN (...) dédoublonne au niveau SQL — comparer
  // au nombre d'ids UNIQUES demandés (doc §14, cas "prestations identiques").
  const requestedPrestationIds = input.items.map((i) => i.prestationId);
  const uniquePrestationIds = [...new Set(requestedPrestationIds)];
  const placeholders = uniquePrestationIds.map(() => "?").join(", ");
  const [serviceRows] = await db.query(
    `SELECT id, name, price,
            duration_minutes,
            COALESCE(buffer_before_minutes, 0) AS buffer_before_minutes,
            COALESCE(buffer_after_minutes, 0)  AS buffer_after_minutes,
            is_online_bookable, ordering_rank
     FROM prestations WHERE pro_id = ? AND id IN (${placeholders}) AND active = TRUE`,
    [input.proId, ...uniquePrestationIds]
  );
  const services = serviceRows as any[];
  if (services.length !== uniquePrestationIds.length) {
    throw new ReservationServiceError(422, "Prestation invalide pour ce professionnel", "SERVICE_NOT_BOOKABLE");
  }
  if (input.requestedByRole === "public" && services.some((s) => !s.is_online_bookable)) {
    throw new ReservationServiceError(422, "Cette prestation n'est pas réservable en ligne", "SERVICE_NOT_BOOKABLE");
  }

  // ── Moteur de prestations (doc §3) : résolution + pricing engine PAR ITEM ──
  // Toujours le même chemin, qu'il y ait 1 ou N prestations — aucune branche
  // "legacy multi-service" séparée (l'ancienne branche sommait les prix bruts
  // sans jamais résoudre variantes/options/questions ; supprimée avec V3).
  const resolvedItemsInInputOrder: ResolvedItem[] = [];
  for (const item of input.items) {
    const base = services.find((s) => s.id === item.prestationId)!;
    const resolvedConfig = await resolveConfigSelection(
      item.prestationId,
      item.selectedVariantValueIds ?? [],
      item.selectedOptionIds ?? []
    );
    const resolvedAnswersForItem = await resolveAnswers(item.prestationId, item.answers ?? []);
    let itemPricing;
    try {
      itemPricing = computeItemPricing({
        basePrice: Number(base.price),
        baseDurationMinutes: Number(base.duration_minutes),
        variantValues: resolvedConfig.variantValues.map((v) => ({ price_delta: Number(v.price_delta), duration_delta: Number(v.duration_delta) })),
        options: resolvedConfig.options.map((o) => ({ price_delta: Number(o.price_delta), duration_delta: Number(o.duration_delta) })),
      });
    } catch (err) {
      if (err instanceof PricingError) {
        throw new ReservationServiceError(422, `« ${base.name} » : ${err.message}`, err.code);
      }
      throw err;
    }
    resolvedItemsInInputOrder.push({
      prestationId: item.prestationId,
      name: base.name,
      orderingRank: base.ordering_rank,
      price: itemPricing.price,
      durationMinutes: itemPricing.durationMinutes,
      variants: resolvedConfig.variantValues,
      options: resolvedConfig.options,
      answers: resolvedAnswersForItem,
    });
  }

  // Ordre métier (doc §4, décision verrouillée) — jamais l'ordre de saisie de
  // la cliente. Détermine à la fois la numérotation `position` des
  // `reservation_items` ET l'ordre des buffers dans le calcul de dispo
  // (durationOverrides ci-dessous reste positionnel sur l'ordre D'ENTRÉE ;
  // c'est loadProContext, dans availability.service.ts, qui retrie de façon
  // identique — cf. sortByOrderingRank).
  const sortedItems = sortByOrderingRank(resolvedItemsInInputOrder, (i) => i.orderingRank, (i) => i.prestationId);

  const { totalPrice: price } = computeReservationTotals(sortedItems.map((i) => ({ price: i.price, durationMinutes: i.durationMinutes })));
  // Durée "brute" (hors buffers) — indicative ici ; la durée réellement
  // bloquée (avec buffers) vient de checkSlotAvailability ci-dessous, seule
  // source de vérité pour blocked_start/end_datetime (doc §5).
  const durationOverrides = requestedPrestationIds.map(
    (_, i) => resolvedItemsInInputOrder[i].durationMinutes
  );
  const prestationName: string = sortedItems.length === 1 ? sortedItems[0].name : `${sortedItems.length} prestations`;

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
    serviceIds: requestedPrestationIds,
    startDatetime: input.startDatetime,
    timezone: input.timezone,
    requestedByRole: input.requestedByRole,
    now,
    durationOverrides,
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
          serviceIds: requestedPrestationIds,
          aroundDatetime: input.startDatetime,
          timezone: input.timezone,
          requestedByRole: input.requestedByRole,
          now,
            durationOverrides,
        });
        const err = reasonToError(preCheck.reason, alt);
        err.extra = { ...(err.extra ?? {}), canOverride: true };
        throw err;
      }
      const alt =
        input.requestedByRole === "public"
          ? await findAlternativeSlots({
              proId: input.proId,
              serviceIds: requestedPrestationIds,
              aroundDatetime: input.startDatetime,
              timezone: input.timezone,
              requestedByRole: "public",
              now,
                durationOverrides,
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
          serviceIds: requestedPrestationIds,
          aroundDatetime: input.startDatetime,
          timezone: input.timezone,
          requestedByRole: input.requestedByRole,
          now,
            durationOverrides,
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

      // Une réservation cliente qui doit être payée en ligne (acompte ou solde
      // via Stripe) ne peut pas être "confirmée" tant que le paiement n'a pas
      // abouti : elle démarre en 'pending' et c'est le webhook Stripe
      // (payment_intent.succeeded) qui la bascule en 'confirmed'. Sinon, un
      // client qui abandonne le paiement — ou dont la clé Stripe n'est pas
      // configurée — se retrouvait avec un RDV confirmé jamais réglé.
      // Le paiement sur place et l'ajout manuel par la pro restent 'confirmed'.
      const requiresOnlinePayment =
        input.bookingSource === "client" &&
        (input.paidOnline ?? false) &&
        depositAmt != null &&
        depositAmt > 0;
      const initialStatus = requiresOnlinePayment ? "pending" : "confirmed";

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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT timezone FROM users WHERE id = ?)), ?, ?, ?, ?, ?, ?, NOW())
         RETURNING id`,
        [
          input.clientId,
          input.proId,
          sortedItems[0].prestationId,
          input.startDatetime,
          snapshot.visibleEnd,
          initialStatus,
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

      const reservationId = (resaRows as any[])[0]?.id as number;

      // ── Moteur de prestations : reservation_items + snapshots normalisés ──
      // Source de vérité fonctionnelle dès V1 (doc §16.3) — une ligne par
      // élément du panier, dans l'ordre métier (`sortedItems`, doc §4).
      // 1 élément (V1/V2) ou N (V3) : exactement le même chemin de code.
      for (const [position, item] of sortedItems.entries()) {
        const [itemRows] = await conn.execute(
          `INSERT INTO reservation_items (reservation_id, prestation_id, snapshot_name, snapshot_price, snapshot_duration_minutes, position)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          [reservationId, item.prestationId, item.name, item.price, item.durationMinutes, position]
        );
        const reservationItemId = (itemRows as any[])[0]?.id as number;

        for (const v of item.variants) {
          await conn.execute(
            `INSERT INTO reservation_item_variants (
               reservation_item_id, variant_group_id, variant_value_id,
               snapshot_group_name, snapshot_value_label, snapshot_price_delta, snapshot_duration_delta
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [reservationItemId, v.variant_group_id, v.id, v.group_name, v.label, v.price_delta, v.duration_delta]
          );
        }
        for (const o of item.options) {
          await conn.execute(
            `INSERT INTO reservation_item_options (reservation_item_id, option_id, snapshot_name, snapshot_price_delta, snapshot_duration_delta)
             VALUES (?, ?, ?, ?, ?)`,
            [reservationItemId, o.id, o.name, o.price_delta, o.duration_delta]
          );
        }
        for (const a of item.answers) {
          await conn.execute(
            `INSERT INTO reservation_item_answers (
               reservation_item_id, question_id, snapshot_question_label, snapshot_question_type,
               snapshot_is_sensitive, snapshot_choices_available, answer_value, answer_values
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              reservationItemId,
              a.questionId,
              a.label,
              a.type,
              a.isSensitive,
              a.choicesAvailable,
              a.answerValue,
              a.answerValues,
            ]
          );
        }
      }

      return {
        reservationId,
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
  }).catch(() => log.warn("[RESERVATION_CREATE]", "notification failed (non-fatal)", { reservationId }));

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
