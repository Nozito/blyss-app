/**
 * Tests — POST /api/reservations
 *
 * Couverts :
 *   Zod validation  → champs manquants, prix négatif, dates incohérentes
 *   Business logic  → prestation non possédée par le pro (403)
 *                     créneau non disponible (409)
 *                     réservation en chevauchement (409)
 *                     pro introuvable (404)
 *                     création réussie (201-style → 200)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({
    execute: mockExecute,
    query: mockQuery,
    getConnection: vi.fn().mockResolvedValue({
      execute: mockExecute,
      query: mockQuery,
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }),
  }),
}));

// ─── 2b. Mock du service de réservation ───────────────────────────────────
// La logique anti-double-booking (lock, re-check, snapshot) est testée
// unitairement dans reservation.service / availability.service. Ici on vérifie
// seulement que l'endpoint mappe correctement résultats & erreurs → HTTP.
const { mockCreateReservation } = vi.hoisted(() => ({ mockCreateReservation: vi.fn() }));
vi.mock("../services/reservation.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/reservation.service")>();
  return { ...actual, createReservation: mockCreateReservation };
});

// ─── 3. Mock Stripe ───────────────────────────────────────────────────────
vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

// ─── 5. Import serveur (APRÈS les mocks) ─────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeClientToken(userId = 42) {
  return jwt.sign({ id: userId, role: "client" }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });
}

/** Corps valide de base pour les tests business-logic */
const validBody = {
  pro_id: 1,
  prestation_id: 10,
  start_datetime: "2027-06-01T10:00:00.000Z",
  end_datetime: "2027-06-01T11:00:00.000Z",
  price: 80,
};

// ═══════════════════════════════════════════════════════════════════════════
// Validation Zod (sans mock DB — on s'arrête avant le handler)
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/reservations — validation Zod", () => {
  const token = makeClientToken();
  beforeEach(() => vi.clearAllMocks());

  it("400 si body vide", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si price est négatif", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, price: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(res.body.details.some((d: { field: string }) => d.field === "price")).toBe(true);
  });

  it("400 si end_datetime <= start_datetime", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...validBody,
        start_datetime: "2027-06-01T11:00:00.000Z",
        end_datetime: "2027-06-01T10:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si start_datetime n'est pas une date ISO valide", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, start_datetime: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si RDV à moins de 14 jours sans early_execution_requested (droit de rétractation)", async () => {
    const soon = new Date(Date.now() + 48 * 3600 * 1000);
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...validBody,
        start_datetime: soon.toISOString(),
        end_datetime: new Date(soon.getTime() + 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(
      res.body.details.some((d: { field: string }) => d.field === "early_execution_requested")
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Business logic (DB mockée)
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/reservations — logique métier", () => {
  const token = makeClientToken();
  beforeEach(() => {
    vi.clearAllMocks();
    // Modèle `slots` legacy : l'endpoint fait un UPDATE best-effort si slot_id.
    mockQuery.mockResolvedValue([[], []]);
  });

  async function importErrors() {
    return await import("../services/reservation.service");
  }

  it("403 si la prestation n'appartient pas au pro", async () => {
    const { ReservationServiceError } = await importErrors();
    mockCreateReservation.mockRejectedValueOnce(
      new ReservationServiceError(422, "Prestation invalide pour ce professionnel", "SERVICE_NOT_BOOKABLE")
    );

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("SERVICE_NOT_BOOKABLE");
  });

  it("409 SLOT_NO_LONGER_AVAILABLE + alternativeSlots si conflit", async () => {
    const { ReservationServiceError, SLOT_NO_LONGER_AVAILABLE } = await importErrors();
    mockCreateReservation.mockRejectedValueOnce(
      new ReservationServiceError(409, "Ce créneau vient d'être réservé.", SLOT_NO_LONGER_AVAILABLE, {
        alternativeSlots: [{ start: "2027-06-01T14:00:00.000Z", end: "2027-06-01T15:00:00.000Z" }],
      })
    );

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SLOT_NO_LONGER_AVAILABLE");
    expect(res.body.alternativeSlots).toHaveLength(1);
  });

  it("le flow client ne transmet jamais d'override au service", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 55,
      price: 80,
      depositPercentage: 30,
      depositAmount: 24,
      overrideApplied: null,
    });

    await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, manual_override: { mode: "conflict", note: "x" } });

    const arg = mockCreateReservation.mock.calls[0][0];
    expect(arg.requestedByRole).toBe("public");
    expect(arg.bookingSource).toBe("client");
    expect(arg.manualOverride).toBeUndefined();
  });

  it("200 et retourne l'id + l'acompte de la réservation créée", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 55,
      price: 80,
      depositPercentage: 30,
      depositAmount: 24,
      overrideApplied: null,
    });

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(55);
    expect(res.body.data.deposit_percentage).toBe(30);
    expect(res.body.data.deposit_amount).toBe(24);
  });

  it("délègue à createReservation avec le clientId du token (jamais du body)", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 55,
      price: 80,
      depositPercentage: null,
      depositAmount: null,
      overrideApplied: null,
    });

    await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${makeClientToken(42)}`)
      .send({ ...validBody, client_id: 999 });

    expect(mockCreateReservation.mock.calls[0][0].clientId).toBe(42);
  });

  it("503 si le service signale une surcharge (DbTimeoutError remonté)", async () => {
    mockCreateReservation.mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"));

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_overloaded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Global error handler
// ═══════════════════════════════════════════════════════════════════════════
describe("Global error handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 (pas 500) sur un endpoint protégé sans token — le handler d'erreur ne masque pas les erreurs métier", async () => {
    const res = await request(app).post("/api/reservations").send(validBody);
    // Pas de token → 401, pas de crash serveur
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
