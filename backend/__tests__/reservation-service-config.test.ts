/**
 * Tests — intégration reservation.service.ts × moteur de prestations
 * (variantes/options sélectionnées, snapshot reservation_items).
 *
 * Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§21.2).
 * Complète reservation-service.test.ts (dispo/verrou/overrides, non affecté
 * par ce chantier) et pricing-engine.test.ts (calcul pur) en validant le
 * câblage : résolution de la sélection → calcul → snapshot inséré.
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

import { createReservation, ReservationServiceError } from "../services/reservation.service";

const MON_9_18 = [{ weekday: 1, start_time: "09:00:00", end_time: "18:00:00" }];

/** Groupe "Longueur" (requis, valeur M +10€/+15min) + option "Nail Art" (+8€/+10min). */
function installFixture(opts: { variantGroups?: any[]; variantValues?: any[]; options?: any[]; insertId?: number }) {
  const insertId = opts.insertId ?? 55;
  mockExecute.mockResolvedValue([[{ id: insertId }], []]);
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes("pg_advisory_xact_lock")) return Promise.resolve([[], []]);
    if (sql.includes("FROM prestations")) {
      return Promise.resolve([
        [
          {
            id: 10,
            name: "Pose Gel X",
            price: 45,
            duration_minutes: 60,
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
            booking_lead_time_minutes: null,
            booking_horizon_days: null,
            is_online_bookable: true,
          },
        ],
        [],
      ]);
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
      return Promise.resolve([opts.variantValues ?? [], []]);
    }
    if (sql.includes("FROM variant_groups")) return Promise.resolve([opts.variantGroups ?? [], []]);
    if (sql.includes("FROM options")) return Promise.resolve([opts.options ?? [], []]);
    return Promise.resolve([[], []]);
  });
}

const baseInput = {
  proId: 1,
  clientId: 42,
  serviceIds: [10],
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

describe("createReservation — moteur de prestations (variantes/options)", () => {
  it("Test 2 — prestation + variante : prix/durée = base + delta, snapshot inséré", async () => {
    installFixture({
      variantGroups: [{ id: 1, name: "Longueur", required: true }],
      variantValues: [
        { id: 100, variant_group_id: 1, group_name: "Longueur", label: "M", price_delta: 10, duration_delta: 15 },
      ],
    });

    const result = await createReservation({ ...baseInput, selectedVariantValueIds: [100] });

    expect(result.price).toBe(55);

    const itemInsert = mockExecute.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO reservation_items"));
    expect(itemInsert).toBeDefined();
    expect(itemInsert![1]).toEqual([result.reservationId, 10, "Pose Gel X", 55, 75, 0]);

    const variantInsert = mockExecute.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO reservation_item_variants"));
    expect(variantInsert).toBeDefined();
    expect(variantInsert![1]).toEqual(
      expect.arrayContaining([1, 100, "Longueur", "M", 10, 15])
    );
  });

  it("Test 3 — prestation + variante + option : cumul des deltas", async () => {
    installFixture({
      variantGroups: [{ id: 1, name: "Longueur", required: true }],
      variantValues: [
        { id: 100, variant_group_id: 1, group_name: "Longueur", label: "M", price_delta: 10, duration_delta: 15 },
      ],
      options: [{ id: 200, name: "Nail Art", price_delta: 8, duration_delta: 10 }],
    });

    const result = await createReservation({
      ...baseInput,
      selectedVariantValueIds: [100],
      selectedOptionIds: [200],
    });

    expect(result.price).toBe(63); // 45 + 10 + 8

    const optionInsert = mockExecute.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO reservation_item_options"));
    expect(optionInsert).toBeDefined();
  });

  it("rejette (422) un groupe obligatoire non renseigné", async () => {
    installFixture({
      variantGroups: [{ id: 1, name: "Longueur", required: true }],
      variantValues: [],
    });

    await expect(createReservation({ ...baseInput, selectedVariantValueIds: [] })).rejects.toMatchObject({
      status: 422,
      code: "VARIANT_GROUP_REQUIRED",
    });
  });

  it("rejette (422) une valeur qui n'est plus active/disponible", async () => {
    installFixture({
      variantGroups: [{ id: 1, name: "Longueur", required: true }],
      variantValues: [], // la valeur demandée n'est plus active → absente du résultat
    });

    await expect(createReservation({ ...baseInput, selectedVariantValueIds: [999] })).rejects.toMatchObject({
      status: 422,
      code: "VARIANT_VALUE_INVALID",
    });
  });

  it("dédoublonne silencieusement une option sélectionnée deux fois", async () => {
    installFixture({
      variantGroups: [],
      options: [{ id: 200, name: "Nail Art", price_delta: 8, duration_delta: 10 }],
    });

    const result = await createReservation({ ...baseInput, selectedOptionIds: [200, 200] });

    expect(result.price).toBe(53); // 45 + 8, une seule fois
    const optionInserts = mockExecute.mock.calls.filter(([sql]: [string]) => sql.includes("INSERT INTO reservation_item_options"));
    expect(optionInserts).toHaveLength(1);
  });

  it("rejette (422) une combinaison dont le total est négatif — pas de correction silencieuse", async () => {
    installFixture({
      variantGroups: [{ id: 1, name: "Forfait", required: true }],
      variantValues: [
        { id: 100, variant_group_id: 1, group_name: "Forfait", label: "Remise exceptionnelle", price_delta: -100, duration_delta: 0 },
      ],
    });

    await expect(createReservation({ ...baseInput, selectedVariantValueIds: [100] })).rejects.toMatchObject({
      status: 422,
      code: "NEGATIVE_PRICE",
    });
  });

  it("Test 1 — prestation simple (sans sélection) = comportement actuel, un seul item snapshoté", async () => {
    installFixture({});

    const result = await createReservation(baseInput);

    expect(result.price).toBe(45);
    const itemInsert = mockExecute.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO reservation_items"));
    expect(itemInsert![1]).toEqual([result.reservationId, 10, "Pose Gel X", 45, 60, 0]);
    const variantInsert = mockExecute.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO reservation_item_variants"));
    expect(variantInsert).toBeUndefined();
  });
});
