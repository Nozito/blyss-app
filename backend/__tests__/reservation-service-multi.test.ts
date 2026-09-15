/**
 * Tests — intégration reservation.service.ts × panier multi-prestations (V3).
 *
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§4, §5, §6, §14, §15).
 * Même pattern de fixtures que reservation-service-config.test.ts (V1) et
 * reservation-service-questions.test.ts (V2), étendu à N prestations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockQuery, conn } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const conn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: mockQuery,
    execute: mockExecute,
  };
  return { mockExecute, mockQuery, conn };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({
    query: mockQuery,
    execute: mockExecute,
    getConnection: vi.fn().mockResolvedValue(conn),
  }),
}));

vi.mock("../lib/notifications", () => ({ sendNotificationToUser: vi.fn().mockResolvedValue(undefined) }));

import { createReservation } from "../services/reservation.service";

const MON_9_18 = [{ weekday: 1, start_time: "09:00:00", end_time: "18:00:00" }];

/**
 * Prestation 10 "Dépose" (rank 0, 15min) + Prestation 20 "Pose" (rank 20, 45min).
 * Prestation 30 "Inactive" existe en base mais active=FALSE (absente du SELECT).
 */
function installFixture(opts: {
  prestations?: any[];
  variantGroupsByPrestation?: Record<number, any[]>;
  variantValuesByGroup?: Record<number, any[]>;
  optionsByPrestation?: Record<number, any[]>;
  questionsByPrestation?: Record<number, any[]>;
  choicesByQuestion?: Record<number, any[]>;
  insertId?: number;
  failOnPrestationItemInsertFor?: number; // simule un échec pendant l'insertion (test atomicité)
}) {
  const insertId = opts.insertId ?? 55;
  const prestations =
    opts.prestations ?? [
      { id: 10, name: "Dépose", price: 20, duration_minutes: 15, buffer_before_minutes: 5, buffer_after_minutes: 0, is_online_bookable: true, ordering_rank: 0 },
      { id: 20, name: "Pose", price: 45, duration_minutes: 45, buffer_before_minutes: 0, buffer_after_minutes: 10, is_online_bookable: true, ordering_rank: 20 },
    ];

  let itemInsertCount = 0;
  mockExecute.mockImplementation((sql: string, params?: any[]) => {
    if (sql.includes("INSERT INTO reservation_items")) {
      itemInsertCount += 1;
      const prestationId = params?.[1];
      if (opts.failOnPrestationItemInsertFor === prestationId) {
        return Promise.reject(new Error("simulated DB failure mid-transaction"));
      }
      return Promise.resolve([[{ id: insertId + itemInsertCount }], []]);
    }
    return Promise.resolve([[{ id: insertId }], []]);
  });

  mockQuery.mockImplementation((sql: string, params?: any[]) => {
    if (sql.includes("pg_advisory_xact_lock")) return Promise.resolve([[], []]);
    if (sql.includes("FROM prestations") && !sql.includes("JOIN")) {
      return Promise.resolve([prestations, []]);
    }
    if (sql.includes("FROM users WHERE id")) {
      return Promise.resolve([
        [{ id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: null, default_booking_horizon_days: null, deposit_percentage: 0, stripe_onboarding_complete: true, uses_availability_engine: true }],
        [],
      ]);
    }
    if (sql.includes("FROM working_hours")) return Promise.resolve([MON_9_18, []]);
    if (sql.includes("FROM blocked_clients")) return Promise.resolve([[], []]);
    if (sql.includes("FROM unavailabilities")) return Promise.resolve([[], []]);
    if (sql.includes("AT TIME ZONE 'UTC'")) return Promise.resolve([[], []]);
    if (sql.includes("FROM reservations") && sql.includes("blocked_start_datetime IS NOT NULL")) return Promise.resolve([[], []]);
    if (sql.includes("FROM variant_values") && sql.includes("JOIN variant_groups")) {
      const groupIds = params?.slice(0, -1) ?? [];
      const all = Object.values(opts.variantValuesByGroup ?? {}).flat();
      return Promise.resolve([all.filter((v: any) => groupIds.includes(v.id)), []]);
    }
    if (sql.includes("FROM variant_groups")) {
      const prestationId = params?.[0];
      return Promise.resolve([opts.variantGroupsByPrestation?.[prestationId] ?? [], []]);
    }
    if (sql.includes("FROM options")) {
      const prestationId = params?.[params.length - 1];
      return Promise.resolve([opts.optionsByPrestation?.[prestationId] ?? [], []]);
    }
    if (sql.includes("FROM questions")) {
      const prestationId = params?.[0];
      return Promise.resolve([opts.questionsByPrestation?.[prestationId] ?? [], []]);
    }
    if (sql.includes("FROM question_choices")) {
      const questionId = params?.[0];
      return Promise.resolve([opts.choicesByQuestion?.[questionId] ?? [], []]);
    }
    return Promise.resolve([[], []]);
  });
}

const baseInput = {
  proId: 1,
  clientId: 42,
  startDatetime: "2026-09-07T10:00:00.000Z", // lundi 12:00 Paris
  requestedByRole: "public" as const,
  bookingSource: "client" as const,
  now: new Date("2026-09-01T08:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  conn.beginTransaction.mockResolvedValue(undefined);
  conn.commit.mockResolvedValue(undefined);
  conn.rollback.mockResolvedValue(undefined);
});

describe("createReservation — panier multi-prestations (V3)", () => {
  it("Test 1 — une seule prestation suit exactement le même chemin qu'avant (non-régression V1)", async () => {
    installFixture({ prestations: [{ id: 10, name: "Solo", price: 30, duration_minutes: 20, buffer_before_minutes: 0, buffer_after_minutes: 0, is_online_bookable: true, ordering_rank: 10 }] });

    const result = await createReservation({ ...baseInput, items: [{ prestationId: 10 }] });

    expect(result.price).toBe(30);
    const itemInserts = mockExecute.mock.calls.filter(([sql]: any[]) => sql.includes("INSERT INTO reservation_items"));
    expect(itemInserts).toHaveLength(1);
    expect(itemInserts[0][1]).toEqual([expect.any(Number), 10, "Solo", 30, 20, 0]);
  });

  it("Test 2 — deux prestations : prix/durée totaux = somme des deux items", async () => {
    installFixture({});

    const result = await createReservation({
      ...baseInput,
      items: [{ prestationId: 20 }, { prestationId: 10 }], // envoyées dans le "mauvais" ordre
    });

    expect(result.price).toBe(65); // 20 (Dépose) + 45 (Pose)
    const itemInserts = mockExecute.mock.calls.filter(([sql]: any[]) => sql.includes("INSERT INTO reservation_items"));
    expect(itemInserts).toHaveLength(2);
  });

  it("Ordre métier : reservation_items est inséré dans l'ordre ordering_rank (Dépose=0 avant Pose=20), pas l'ordre d'entrée", async () => {
    installFixture({});

    await createReservation({ ...baseInput, items: [{ prestationId: 20 }, { prestationId: 10 }] });

    const itemInserts = mockExecute.mock.calls.filter(([sql]: any[]) => sql.includes("INSERT INTO reservation_items"));
    // [reservationId, prestationId, name, price, duration, position]
    expect(itemInserts[0][1]).toEqual([expect.any(Number), 10, "Dépose", 20, 15, 0]);
    expect(itemInserts[1][1]).toEqual([expect.any(Number), 20, "Pose", 45, 45, 1]);
  });

  it("Prestations identiques autorisées : deux occurrences de la même prestation restent deux items distincts", async () => {
    installFixture({ prestations: [{ id: 10, name: "Manucure express", price: 15, duration_minutes: 20, buffer_before_minutes: 0, buffer_after_minutes: 0, is_online_bookable: true, ordering_rank: 10 }] });

    const result = await createReservation({ ...baseInput, items: [{ prestationId: 10 }, { prestationId: 10 }] });

    expect(result.price).toBe(30); // 15 x 2
    const itemInserts = mockExecute.mock.calls.filter(([sql]: any[]) => sql.includes("INSERT INTO reservation_items"));
    expect(itemInserts).toHaveLength(2);
    expect(itemInserts[0][1][1]).toBe(10);
    expect(itemInserts[1][1][1]).toBe(10);
  });

  it("Chaque item conserve sa PROPRE configuration (variantes/options indépendantes)", async () => {
    installFixture({
      variantGroupsByPrestation: { 20: [{ id: 1, name: "Longueur", required: true }] },
      variantValuesByGroup: { 1: [{ id: 100, variant_group_id: 1, group_name: "Longueur", label: "M", price_delta: 10, duration_delta: 5 }] },
      optionsByPrestation: { 10: [{ id: 200, name: "Finition rapide", price_delta: 3, duration_delta: 0 }] },
    });

    const result = await createReservation({
      ...baseInput,
      items: [
        { prestationId: 10, selectedOptionIds: [200] }, // Dépose + option
        { prestationId: 20, selectedVariantValueIds: [100] }, // Pose + variante
      ],
    });

    expect(result.price).toBe(78); // (20+3) + (45+10)
    const variantInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_variants"));
    const optionInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_options"));
    expect(variantInsert).toBeDefined();
    expect(optionInsert).toBeDefined();
    // La variante doit être rattachée au reservation_item de "Pose", l'option à celui de "Dépose" — des ids différents.
    expect(variantInsert![1][0]).not.toBe(optionInsert![1][0]);
  });

  it("Questions indépendantes par prestation : les réponses ne se mélangent jamais entre items", async () => {
    installFixture({
      questionsByPrestation: {
        10: [{ id: 1, label: "Dépose : allergie connue ?", type: "boolean", required: true, is_sensitive: false }],
        20: [{ id: 2, label: "Pose : résultat souhaité ?", type: "short_text", required: false, is_sensitive: false }],
      },
    });

    await createReservation({
      ...baseInput,
      items: [
        { prestationId: 10, answers: [{ questionId: 1, value: "true" }] },
        { prestationId: 20, answers: [{ questionId: 2, value: "Effet naturel" }] },
      ],
    });

    const answerInserts = mockExecute.mock.calls.filter(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInserts).toHaveLength(2);
    const deposeAnswer = answerInserts.find((c: any[]) => c[1][1] === 1);
    const poseAnswer = answerInserts.find((c: any[]) => c[1][1] === 2);
    expect(deposeAnswer![1][6]).toBe("true");
    expect(poseAnswer![1][6]).toBe("Effet naturel");
    // Rattachées à des reservation_item_id différents (Dépose est l'item 0, Pose l'item 1).
    expect(deposeAnswer![1][0]).not.toBe(poseAnswer![1][0]);
  });

  it("rejette (422) si UNE prestation du panier a une configuration invalide, aucune n'est créée (atomicité applicative)", async () => {
    installFixture({
      variantGroupsByPrestation: { 20: [{ id: 1, name: "Longueur", required: true }] },
      variantValuesByGroup: {}, // aucune valeur active → groupe requis non satisfaisable
    });

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10 }, { prestationId: 20, selectedVariantValueIds: [] }] })
    ).rejects.toMatchObject({ status: 422, code: "VARIANT_GROUP_REQUIRED" });

    // La résolution échoue AVANT la transaction : aucun INSERT ne doit avoir eu lieu.
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejette (422) une prestation inactive dans le panier — aucune réservation créée même si les autres sont valides", async () => {
    installFixture({
      prestations: [
        { id: 10, name: "Dépose", price: 20, duration_minutes: 15, buffer_before_minutes: 5, buffer_after_minutes: 0, is_online_bookable: true, ordering_rank: 0 },
        // id 20 volontairement absent (simule active=FALSE, filtré par le SELECT réel)
      ],
    });

    await expect(createReservation({ ...baseInput, items: [{ prestationId: 10 }, { prestationId: 20 }] })).rejects.toMatchObject({
      status: 422,
      code: "SERVICE_NOT_BOOKABLE",
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("échec pendant l'insertion d'un item → transaction annulée (rollback), pas de réservation partielle", async () => {
    installFixture({ failOnPrestationItemInsertFor: 20 });

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10 }, { prestationId: 20 }] })
    ).rejects.toThrow("simulated DB failure mid-transaction");

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("le prix/la durée du panier ne dépendent jamais des montants envoyés par le client (toujours recalculés serveur)", async () => {
    installFixture({});
    // input.items n'a pas de champ price/duration — le type ne le permet même
    // pas — ce test documente explicitement l'invariant côté service.
    const result = await createReservation({ ...baseInput, items: [{ prestationId: 10 }, { prestationId: 20 }] });
    expect(result.price).toBe(65); // toujours 20+45, peu importe ce qu'un client pourrait tenter d'envoyer
  });
});
