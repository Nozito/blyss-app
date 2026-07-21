/**
 * Tests — POST /api/pro/subscription/sync
 *
 * Couverts :
 *   Aucun entitlement actif chez RevenueCat → reconciled: false, DB inchangée
 *   DB déjà à jour (même plan) → reconciled: false, aucune écriture
 *   DB en retard (plan RC différent / absent) → reconciled: true, subscriptions + users mis à jour
 *   Le plan vient exclusivement de RevenueCat, jamais d'un champ du body de la requête
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockExecute, mockQuery, mockGetActiveEntitlement } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const mockGetActiveEntitlement = vi.fn();
  return { mockExecute, mockQuery, mockGetActiveEntitlement };
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
  DbTimeoutError: class DbTimeoutError extends Error {},
}));

// ─── 3. Mock lib/revenuecat ───────────────────────────────────────────────
vi.mock("../lib/revenuecat", () => ({
  getActiveEntitlement: mockGetActiveEntitlement,
}));

// ─── 4. Mock Stripe ────────────────────────────────────────────────────────
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  },
}));

// ─── 5. Mock InstagramService ──────────────────────────────────────────────
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

// ─── 6. Import serveur (APRÈS les mocks) ──────────────────────────────────
import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
function makeToken(userId = 77, role = "pro") {
  return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("POST /api/pro/subscription/sync", () => {
  const token = makeToken(77, "pro");

  // requireProAccess's own role/subscription-status check query must resolve
  // to a valid pro user for every test in this file — /subscription/sync is
  // whitelisted from the "must already be pro_status='active'" requirement
  // (that's the whole point: reconcile a purchase whose webhook hasn't
  // landed yet), but the role-check query itself still runs for every request.
  function mockActivePro(currentSubscriptionPlanRow: unknown[] = []) {
    let call = 0;
    mockQuery.mockImplementation((sql: unknown) => {
      call++;
      if (typeof sql === "string" && sql.includes("SELECT role, is_admin, pro_status")) {
        return Promise.resolve([[{ role: "pro", is_admin: 0, pro_status: "inactive" }], []]);
      }
      if (typeof sql === "string" && sql.includes("SELECT plan FROM subscriptions")) {
        return Promise.resolve([currentSubscriptionPlanRow, []]);
      }
      return Promise.resolve([[], []]);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ rowCount: 1 }]);
    mockQuery.mockResolvedValue([[], []]);
  });

  it("aucun entitlement actif chez RevenueCat → reconciled: false, aucune écriture", async () => {
    mockActivePro();
    mockGetActiveEntitlement.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/pro/subscription/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { reconciled: false } });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("DB déjà alignée avec RevenueCat (même plan actif) → reconciled: false, aucune écriture", async () => {
    mockActivePro([{ plan: "serenite" }]);
    mockGetActiveEntitlement.mockResolvedValueOnce({ plan: "serenite", expiresAtMs: Date.now() + 1000 });

    const res = await request(app)
      .post("/api/pro/subscription/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { reconciled: false, plan: "serenite" } });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("DB en retard (webhook manqué) → reconciled: true, subscriptions + pro_status mis à jour depuis RevenueCat uniquement", async () => {
    mockActivePro([]); // no active row in DB yet
    mockGetActiveEntitlement.mockResolvedValueOnce({ plan: "signature", expiresAtMs: Date.now() + 1000 });

    const res = await request(app)
      .post("/api/pro/subscription/sync")
      .set("Authorization", `Bearer ${token}`)
      // Even if a client tried to smuggle a different plan/price in the body,
      // the route takes no body params at all — the plan comes only from RC.
      .send({ plan: "start", monthlyPrice: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { reconciled: true, plan: "signature" } });

    const calls = mockExecute.mock.calls as unknown[][];
    const insertCall = calls.find((a) => sqlIncludes(a, "INSERT INTO subscriptions"));
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toContain("signature");
    expect(insertCall?.[1]).not.toContain("start");
    expect(calls.find((a) => sqlIncludes(a, "UPDATE users", "active"))).toBeDefined();
  });

  it("401 sans jeton d'authentification", async () => {
    const res = await request(app).post("/api/pro/subscription/sync");
    expect(res.status).toBe(401);
  });
});
