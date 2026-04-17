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

// ─── 4. Mock InstagramService ─────────────────────────────────────────────
vi.mock("../services/InstagramService", () => {
  class MockInstagramService {
    getConnectUrl() { return "http://mock-ig-url"; }
    async handleOAuthCallback() { return null; }
    async getStatus() { return null; }
    async disconnect() {}
    async syncMedia() { return { success: true }; }
    async getMedia() { return []; }
  }
  return { InstagramService: MockInstagramService };
});

// ─── 5. Import serveur (APRÈS les mocks) ─────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeClientToken(userId = 42) {
  return jwt.sign({ id: userId, role: "client" }, JWT_SECRET, { expiresIn: "15m" });
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
});

// ═══════════════════════════════════════════════════════════════════════════
// Business logic (DB mockée)
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/reservations — logique métier", () => {
  const token = makeClientToken();
  beforeEach(() => vi.clearAllMocks());

  it("403 si la prestation n'appartient pas au pro", async () => {
    // Prestation check → vide (non trouvée pour ce pro)
    mockQuery.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("409 si le créneau est déjà réservé (slot_id fourni)", async () => {
    // Prestation check → OK
    mockQuery.mockResolvedValueOnce([[{ id: 10, name: "Pose gel", buffer_after_minutes: 0 }]]);
    // Blacklist check → non bloquée
    mockQuery.mockResolvedValueOnce([[]]);
    // Slot check → status = 'booked'
    mockQuery.mockResolvedValueOnce([[{ status: "booked" }]]);

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, slot_id: 5 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("409 si chevauchement de réservation détecté", async () => {
    // Prestation check → OK
    mockQuery.mockResolvedValueOnce([[{ id: 10, name: "Pose gel", buffer_after_minutes: 0 }]]);
    // Blacklist check → non bloquée
    mockQuery.mockResolvedValueOnce([[]]);
    // (pas de slot_id) Overlap check → conflit trouvé
    mockQuery.mockResolvedValueOnce([[{ id: 99 }]]);

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("404 si le pro n'existe pas en DB", async () => {
    // Prestation check → OK
    mockQuery.mockResolvedValueOnce([[{ id: 10, name: "Pose gel", buffer_after_minutes: 0 }]]);
    // Blacklist check → non bloquée
    mockQuery.mockResolvedValueOnce([[]]);
    // Overlap check → aucun conflit
    mockQuery.mockResolvedValueOnce([[]]);
    // Pro query → vide
    mockQuery.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("200 et retourne l'id de la réservation créée", async () => {
    // Prestation check → OK
    mockQuery.mockResolvedValueOnce([[{ id: 10, name: "Pose gel", buffer_after_minutes: 0 }]]);
    // Blacklist check → non bloquée
    mockQuery.mockResolvedValueOnce([[]]);
    // Overlap check → aucun conflit
    mockQuery.mockResolvedValueOnce([[]]);
    // Pro query → deposit 30%
    mockQuery.mockResolvedValueOnce([[{ deposit_percentage: 30, stripe_onboarding_complete: 1 }]]);
    // INSERT reservations
    mockExecute.mockResolvedValueOnce([{ insertId: 55 }]);
    // (notification queries sont dans un try/catch — si non mockées, elles échouent silencieusement)

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(55);
    expect(res.body.data.deposit_percentage).toBe(30);
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
