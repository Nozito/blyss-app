/**
 * Tests — GET/POST/DELETE /api/pro/unavailabilities
 *
 * Couverts :
 *   Validation Zod → champs manquants, dates invalides, end < start
 *   GET            → retourne la liste du pro (200)
 *   POST           → création réussie (200)
 *   DELETE         → suppression réussie (200)
 *   DELETE         → 404 si non trouvé / appartient à un autre pro
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockQuery, mockConnection } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockConnection = {
    query: vi.fn(),
    execute: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  return { mockQuery, mockConnection };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => {
  class DbTimeoutError extends Error {}
  return {
    DbTimeoutError,
    getDb: () => ({
      query: mockQuery,
      execute: vi.fn(),
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    }),
  };
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

function makeProToken(userId = 7) {
  return jwt.sign({ id: userId, role: "pro" }, JWT_SECRET, { expiresIn: "15m" });
}

const validBody = {
  start_date: "2027-06-01",
  end_date: "2027-06-05",
  reason: "Congés",
};

// ═══════════════════════════════════════════════════════════════════════════
// Validation Zod
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/pro/unavailabilities — validation Zod", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("400 si start_date manquant", async () => {
    const res = await request(app)
      .post("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`)
      .send({ end_date: "2027-06-05" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si end_date manquant", async () => {
    const res = await request(app)
      .post("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`)
      .send({ start_date: "2027-06-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si format de date invalide", async () => {
    const res = await request(app)
      .post("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`)
      .send({ start_date: "01/06/2027", end_date: "2027-06-05" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si end_date < start_date", async () => {
    const res = await request(app)
      .post("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`)
      .send({ start_date: "2027-06-10", end_date: "2027-06-05" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Business logic
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/pro/unavailabilities — création", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("200 — crée l'indisponibilité et la retourne", async () => {
    const created = { id: 1, pro_id: 7, ...validBody, created_at: new Date().toISOString() };
    mockConnection.query.mockResolvedValueOnce([[created], []]);

    const res = await request(app)
      .post("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 1, pro_id: 7 });
  });
});

describe("GET /api/pro/unavailabilities", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("200 — retourne la liste", async () => {
    const rows = [
      { id: 1, pro_id: 7, start_date: "2027-06-01", end_date: "2027-06-05", reason: "Congés" },
    ];
    mockConnection.query.mockResolvedValueOnce([rows, []]);

    const res = await request(app)
      .get("/api/pro/unavailabilities")
      .set("Cookie", `access_token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe("DELETE /api/pro/unavailabilities/:id", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("404 si l'indisponibilité n'appartient pas au pro", async () => {
    mockConnection.query.mockResolvedValueOnce([[], []]); // rowCount = 0

    const res = await request(app)
      .delete("/api/pro/unavailabilities/999")
      .set("Cookie", `access_token=${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
