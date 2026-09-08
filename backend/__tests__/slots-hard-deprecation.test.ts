/**
 * Tests — dépréciation DURE des routes slots (chantier 4.6)
 *
 * SLOTS_HARD_DEPRECATION=true → 410 SLOTS_DEPRECATED pour TOUT LE MONDE
 * (y compris une pro encore en mode legacy), sur POST /api/pro/slots,
 * POST /api/slots/create et PATCH /api/pro/slots/:id.
 *
 * Fichier séparé de slots-deprecation.test.ts : le flag est lu au chargement
 * du module server.ts, et vitest isole chaque fichier dans son propre process.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Doit être défini AVANT l'import de server.ts (const SLOTS_HARD_DEPRECATION).
vi.hoisted(() => {
  process.env.SLOTS_HARD_DEPRECATION = "true";
});

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({
    query: mockQuery,
    execute: mockQuery,
    getConnection: vi.fn().mockResolvedValue({
      query: mockQuery,
      execute: mockQuery,
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }),
  }),
}));

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
const proToken = (id = 7) => jwt.sign({ id, role: "pro" }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });

beforeEach(() => {
  vi.clearAllMocks();
  // Pro LEGACY (uses_availability_engine = false) — le flag dur prime quand même.
  mockQuery.mockImplementation((sql: string) => {
    if (String(sql).includes("SELECT role, is_admin, pro_status")) {
      return Promise.resolve([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
    }
    if (String(sql).includes("uses_availability_engine FROM users")) {
      return Promise.resolve([[{ uses_availability_engine: false }], []]);
    }
    return Promise.resolve([[{ id: 1 }], []]);
  });
});

describe("SLOTS_HARD_DEPRECATION", () => {
  it("POST /api/pro/slots → 410 même pour une pro legacy", async () => {
    const res = await request(app)
      .post("/api/pro/slots")
      .set("Authorization", `Bearer ${proToken()}`)
      .send({ date: "2027-01-04", time: "10:00", duration: 60 });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("SLOTS_DEPRECATED");
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO slots"))).toBe(false);
  });

  it("PATCH /api/pro/slots/:id → 410", async () => {
    const res = await request(app)
      .patch("/api/pro/slots/123")
      .set("Authorization", `Bearer ${proToken()}`)
      .send({ status: "blocked" });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("SLOTS_DEPRECATED");
  });
});
