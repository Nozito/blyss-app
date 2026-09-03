/**
 * Tests — dépréciation des routes de création de slots (chantier 4.6)
 *
 * POST /api/pro/slots et POST /api/slots/create :
 *   - pro migrée (uses_availability_engine)  → 410 SLOTS_DEPRECATED
 *   - pro legacy                             → passe, header Deprecation: true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

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

beforeEach(() => vi.clearAllMocks());

/** requireProAccess (gate /api/pro/*) + la lecture du flag. */
function routeQueries(migrated: boolean) {
  return (sql: string) => {
    if (sql.includes("SELECT role, is_admin, pro_status")) {
      return Promise.resolve([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
    }
    if (sql.includes("uses_availability_engine FROM users")) {
      return Promise.resolve([[{ uses_availability_engine: migrated }], []]);
    }
    return Promise.resolve([[{ id: 1 }], []]);
  };
}

describe("POST /api/pro/slots — dépréciation", () => {
  it("410 SLOTS_DEPRECATED pour une pro migrée", async () => {
    mockQuery.mockImplementation(routeQueries(true));

    const res = await request(app)
      .post("/api/pro/slots")
      .set("Authorization", `Bearer ${proToken()}`)
      .send({ date: "2027-01-04", time: "10:00", duration: 60 });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("SLOTS_DEPRECATED");
    // aucun INSERT slots émis
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO slots"))).toBe(false);
  });

  it("pro legacy : la création passe, réponse marquée Deprecation", async () => {
    mockQuery.mockImplementation(routeQueries(false));

    const res = await request(app)
      .post("/api/pro/slots")
      .set("Authorization", `Bearer ${proToken()}`)
      .send({ date: "2027-01-04", time: "10:00", duration: 60 });

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe("true");
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO slots"))).toBe(true);
  });
});
