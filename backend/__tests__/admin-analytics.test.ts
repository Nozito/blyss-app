/**
 * Smoke tests — Module Analytics / Comportement (Phase 1).
 *
 * Vérifie la protection RBAC + qu'un appel admin renvoie une réponse structurée.
 * La logique SQL est validée à part (requêtes testées contre la DB prod en
 * lecture pendant le développement).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockExecute, mockQuery } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
}));

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

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
    refunds = { create: vi.fn() };
  }
  return { default: MockStripe };
});

import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
const makeToken = (userId: number) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });

const ENDPOINTS = [
  "/api/admin/analytics/v2/clients/kpis",
  "/api/admin/analytics/v2/clients/cohorts",
  "/api/admin/analytics/v2/pros/kpis",
  "/api/admin/analytics/v2/pros/activity",
  "/api/admin/analytics/v2/pros/cohorts",
  "/api/admin/analytics/v2/pros/services",
  "/api/admin/analytics/v2/marketplace",
  "/api/admin/analytics/v2/segments",
  "/api/admin/analytics/v2/subscriptions/deep",
  "/api/admin/analytics/v2/subscriptions/catalog",
  "/api/admin/analytics/v2/data-health",
];

describe("Analytics v2 — RBAC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 sans token", async () => {
    const res = await request(app).get("/api/admin/analytics/v2/clients/kpis");
    expect(res.status).toBe(401);
  });

  it("403 pour un non-admin", async () => {
    const token = makeToken(99);
    mockQuery.mockResolvedValueOnce([[{ is_admin: 0 }]]);
    const res = await request(app)
      .get("/api/admin/analytics/v2/clients/kpis")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("Analytics v2 — réponse admin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("data-health répond 200 et structuré", async () => {
    const token = makeToken(1);
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // RBAC check
    mockQuery.mockResolvedValue([[{
      reservations: 10, payments: 5, subscriptions: 2, pros: 3, clients: 7,
      users_with_login: 4, clients_with_source: 1, reviews: 6,
    }]]);

    const res = await request(app)
      .get("/api/admin/analytics/v2/data-health")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.metrics)).toBe(true);
    expect(res.body.data.legend).toHaveProperty("real");
  });

  it("tous les endpoints sont montés (pas de 404)", async () => {
    const token = makeToken(1);
    for (const url of ENDPOINTS) {
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
      mockQuery.mockResolvedValue([[{}]]);
      const res = await request(app).get(url).set("Authorization", `Bearer ${token}`);
      expect(res.status, `${url} → ${res.status}`).not.toBe(404);
      expect([200, 500]).toContain(res.status); // 500 possible si le mock ne colle pas au shape exact — on veut juste prouver le routage + RBAC
    }
  });
});
