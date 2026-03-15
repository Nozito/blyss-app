/**
 * Tests — PATCH /api/pro/reservations/:id/status
 *
 * Couverts :
 *   Validation Zod → status invalide, body vide
 *   Business logic → 404 si réservation inconnue / autre pro
 *                    400 si déjà finalisée
 *                    200 + libération slot si cancelled
 *                    200 si completed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockConnection } = vi.hoisted(() => {
  const mockConnection = {
    query: vi.fn(),
    execute: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  return { mockConnection };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => {
  class DbTimeoutError extends Error {}
  return {
    DbTimeoutError,
    getDb: () => ({
      query: vi.fn(),
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

// ═══════════════════════════════════════════════════════════════════════════
// Validation Zod
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/pro/reservations/:id/status — validation Zod", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("400 si body vide", async () => {
    const res = await request(app)
      .patch("/api/pro/reservations/1/status")
      .set("Cookie", `access_token=${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si status invalide (ex: 'pending')", async () => {
    const res = await request(app)
      .patch("/api/pro/reservations/1/status")
      .set("Cookie", `access_token=${token}`)
      .send({ status: "pending" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Business logic
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/pro/reservations/:id/status — business logic", () => {
  const token = makeProToken();
  beforeEach(() => vi.clearAllMocks());

  it("404 si réservation introuvable ou appartient à un autre pro", async () => {
    mockConnection.query.mockResolvedValueOnce([[], []]); // SELECT → not found

    const res = await request(app)
      .patch("/api/pro/reservations/999/status")
      .set("Cookie", `access_token=${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("400 si la réservation est déjà finalisée", async () => {
    mockConnection.query.mockResolvedValueOnce([[{ id: 1, status: "completed", slot_id: null }], []]);

    const res = await request(app)
      .patch("/api/pro/reservations/1/status")
      .set("Cookie", `access_token=${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("200 si completed — met à jour le status", async () => {
    mockConnection.query
      .mockResolvedValueOnce([[{ id: 1, status: "confirmed", slot_id: null }], []])
      .mockResolvedValueOnce([[], []]); // UPDATE

    const res = await request(app)
      .patch("/api/pro/reservations/1/status")
      .set("Cookie", `access_token=${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200 si cancelled avec slot_id — libère le slot", async () => {
    mockConnection.query
      .mockResolvedValueOnce([[{ id: 1, status: "confirmed", slot_id: 5 }], []])
      .mockResolvedValueOnce([[], []]) // UPDATE reservations
      .mockResolvedValueOnce([[], []]); // UPDATE slots

    const res = await request(app)
      .patch("/api/pro/reservations/1/status")
      .set("Cookie", `access_token=${token}`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Third call should update slots
    const calls = mockConnection.query.mock.calls;
    const slotUpdateCall = calls.find((c: any[]) =>
      String(c[0]).toLowerCase().includes("slots") &&
      String(c[0]).toLowerCase().includes("available")
    );
    expect(slotUpdateCall).toBeDefined();
  });
});
