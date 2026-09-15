/**
 * Tests — intégration reservation.service.ts × questions personnalisées
 * (moteur de prestations V2, snapshot reservation_item_answers).
 *
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9, §21.2).
 * Mêmes fixtures/conventions que reservation-service-config.test.ts (V1).
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

function installFixture(opts: { questions?: any[]; choices?: Record<number, any[]>; insertId?: number }) {
  const insertId = opts.insertId ?? 55;
  mockExecute.mockResolvedValue([[{ id: insertId }], []]);
  mockQuery.mockImplementation((sql: string, params?: any[]) => {
    if (sql.includes("pg_advisory_xact_lock")) return Promise.resolve([[], []]);
    if (sql.includes("FROM prestations") && !sql.includes("JOIN")) {
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
    if (sql.includes("FROM variant_groups")) return Promise.resolve([[], []]);
    if (sql.includes("FROM options")) return Promise.resolve([[], []]);
    if (sql.includes("FROM questions")) return Promise.resolve([opts.questions ?? [], []]);
    if (sql.includes("FROM question_choices")) {
      const questionId = params?.[0];
      return Promise.resolve([opts.choices?.[questionId] ?? [], []]);
    }
    return Promise.resolve([[], []]);
  });
}

const baseInput = {
  proId: 1,
  clientId: 42,
  items: [{ prestationId: 10 }],
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

describe("createReservation — questions personnalisées (V2)", () => {
  it("Test 1 — aucune question = comportement V1 inchangé, aucune ligne reservation_item_answers", async () => {
    installFixture({});
    const result = await createReservation(baseInput);
    expect(result.price).toBe(45); // prix inchangé — les questions n'affectent jamais le pricing
    const answerInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInsert).toBeUndefined();
  });

  it("question short_text facultative répondue : snapshot inséré, prix inchangé", async () => {
    installFixture({ questions: [{ id: 1, label: "Précisions ?", type: "short_text", required: false, is_sensitive: false }] });

    const result = await createReservation({
      ...baseInput,
      items: [{ prestationId: 10, answers: [{ questionId: 1, value: "Ongles courts svp" }] }],
    });

    expect(result.price).toBe(45);
    const answerInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInsert).toBeDefined();
    expect(answerInsert![1]).toEqual([
      expect.any(Number), // reservation_item_id
      1,
      "Précisions ?",
      "short_text",
      false,
      null,
      "Ongles courts svp",
      null,
    ]);
  });

  it("rejette (422) une question requise sans réponse", async () => {
    installFixture({ questions: [{ id: 1, label: "As-tu déjà une pose ?", type: "boolean", required: true, is_sensitive: false }] });

    await expect(createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [] }] })).rejects.toMatchObject({
      status: 422,
      code: "QUESTION_REQUIRED",
    });
  });

  it("accepte une réponse boolean valide ('true'/'false')", async () => {
    installFixture({ questions: [{ id: 1, label: "As-tu déjà une pose ?", type: "boolean", required: true, is_sensitive: false }] });

    const result = await createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, value: "true" }] }] });
    expect(result.reservationId).toBeDefined();
  });

  it("rejette (422) une réponse boolean invalide", async () => {
    installFixture({ questions: [{ id: 1, label: "As-tu déjà une pose ?", type: "boolean", required: true, is_sensitive: false }] });

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, value: "peut-être" }] }] })
    ).rejects.toMatchObject({ status: 422, code: "QUESTION_ANSWER_INVALID" });
  });

  it("single_choice : résout et snapshote le LIBELLÉ du choix sélectionné", async () => {
    installFixture({
      questions: [{ id: 1, label: "Résultat souhaité ?", type: "single_choice", required: true, is_sensitive: false }],
      choices: { 1: [{ id: 100, label: "Naturel" }, { id: 101, label: "Glossy" }] },
    });

    await createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, values: [101] }] }] });

    const answerInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInsert![1][6]).toBe("Glossy"); // answer_value = libellé, pas l'id
    expect(answerInsert![1][5]).toEqual(["Naturel", "Glossy"]); // snapshot_choices_available
  });

  it("multi_choice : snapshote plusieurs libellés dans answer_values, dédoublonnés", async () => {
    installFixture({
      questions: [{ id: 1, label: "Styles souhaités ?", type: "multi_choice", required: false, is_sensitive: false }],
      choices: { 1: [{ id: 100, label: "French" }, { id: 101, label: "Nail Art" }] },
    });

    await createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, values: [100, 101, 100] }] }] });

    const answerInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInsert![1][7]).toEqual(["French", "Nail Art"]);
    expect(answerInsert![1][6]).toBeNull(); // answer_value non utilisé pour multi_choice
  });

  it("rejette (422) un choix qui n'appartient pas à la question", async () => {
    installFixture({
      questions: [{ id: 1, label: "Résultat souhaité ?", type: "single_choice", required: true, is_sensitive: false }],
      choices: { 1: [{ id: 100, label: "Naturel" }] },
    });

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, values: [999] }] }] })
    ).rejects.toMatchObject({ status: 422, code: "QUESTION_ANSWER_INVALID" });
  });

  it("question sensible sans consentement → 422 SENSITIVE_CONSENT_REQUIRED", async () => {
    installFixture({ questions: [{ id: 1, label: "Allergie connue ?", type: "short_text", required: false, is_sensitive: true }] });

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, value: "Aucune", consent: false }] }] })
    ).rejects.toMatchObject({ status: 422, code: "SENSITIVE_CONSENT_REQUIRED" });
  });

  it("question sensible avec consentement explicite → acceptée, snapshot_is_sensitive=true", async () => {
    installFixture({ questions: [{ id: 1, label: "Allergie connue ?", type: "short_text", required: false, is_sensitive: true }] });

    await createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, value: "Aucune", consent: true }] }] });

    const answerInsert = mockExecute.mock.calls.find(([sql]: any[]) => sql.includes("INSERT INTO reservation_item_answers"));
    expect(answerInsert![1][4]).toBe(true); // snapshot_is_sensitive
  });

  it("rejette (422) une réponse à une question qui n'est plus active/disponible", async () => {
    installFixture({ questions: [] }); // la question 1 a été désactivée entre-temps

    await expect(
      createReservation({ ...baseInput, items: [{ prestationId: 10, answers: [{ questionId: 1, value: "test" }] }] })
    ).rejects.toMatchObject({ status: 422, code: "QUESTION_INVALID" });
  });
});
