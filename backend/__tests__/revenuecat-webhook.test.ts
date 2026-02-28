/**
 * Tests — RevenueCat Webhook handler
 *
 * Couverts :
 *   INITIAL_PURCHASE → INSERT subscription + UPDATE users SET pro_status='active'
 *   RENEWAL → même flow activate
 *   CANCELLATION → UPDATE subscriptions cancelled + UPDATE users SET pro_status='inactive'
 *   EXPIRATION → même que CANCELLATION
 *   Secret invalide → 401
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── 1. Mocks hoistés ──────────────────────────────────────────────────────
const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

// ─── 2. Mock lib/db ────────────────────────────────────────────────────────
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
  DbTimeoutError: class DbTimeoutError extends Error {
    constructor() { super("DB timeout"); this.name = "DbTimeoutError"; }
  },
}));

// ─── 3. Mock Stripe ────────────────────────────────────────────────────────
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: vi.fn() };
    paymentIntents = { create: vi.fn(), retrieve: vi.fn() };
    accounts = { retrieve: vi.fn() };
    accountLinks = { create: vi.fn() };
  },
}));

// ─── 4. Mock InstagramService ──────────────────────────────────────────────
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

// ─── 5. Import du serveur (APRÈS les mocks) ───────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const VALID_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

function sendRCWebhook(eventType: string, opts: {
  userId?: string;
  productId?: string;
  expirationAtMs?: number | null;
  authHeader?: string;
} = {}) {
  const {
    userId = "42",
    productId = "blyss_start_monthly",
    expirationAtMs = null,
    authHeader = `Bearer ${VALID_SECRET}`,
  } = opts;

  return request(app)
    .post("/api/webhooks/revenuecat")
    .set("Authorization", authHeader)
    .send({
      event: {
        type: eventType,
        app_user_id: userId,
        product_id: productId,
        expiration_at_ms: expirationAtMs,
        id: `rc_evt_${Date.now()}`,
      },
    });
}

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/revenuecat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ rowCount: 1 }]);
    mockQuery.mockResolvedValue([[], []]);
  });

  it("INITIAL_PURCHASE → INSERT subscription + UPDATE users pro_status='active'", async () => {
    const res = await sendRCWebhook("INITIAL_PURCHASE", {
      userId: "10",
      productId: "blyss_serenite_monthly",
      expirationAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    const calls = mockExecute.mock.calls as unknown[][];

    expect(calls.find((a) => sqlIncludes(a, "UPDATE subscriptions", "cancelled"))).toBeDefined();
    expect(calls.find((a) => sqlIncludes(a, "INSERT INTO subscriptions"))).toBeDefined();
    expect(calls.find((a) => sqlIncludes(a, "UPDATE users", "active"))).toBeDefined();
  });

  it("RENEWAL → même flow activate avec plan déduit du productId", async () => {
    const res = await sendRCWebhook("RENEWAL", {
      userId: "11",
      productId: "blyss_signature_monthly",
      expirationAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const insertCall = calls.find((a) => sqlIncludes(a, "INSERT INTO subscriptions"));
    expect(insertCall).toBeDefined();
    // Vérifier que le plan 'signature' est dans les params
    expect(insertCall?.[1]).toContain("signature");
  });

  it("CANCELLATION → UPDATE subscriptions cancelled + UPDATE users pro_status='inactive'", async () => {
    const res = await sendRCWebhook("CANCELLATION", { userId: "12" });

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    expect(calls.find((a) => sqlIncludes(a, "UPDATE subscriptions", "cancelled"))).toBeDefined();
    expect(calls.find((a) => sqlIncludes(a, "UPDATE users", "inactive"))).toBeDefined();
  });

  it("EXPIRATION → même comportement que CANCELLATION", async () => {
    const res = await sendRCWebhook("EXPIRATION", { userId: "13" });

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    expect(calls.find((a) => sqlIncludes(a, "UPDATE users", "inactive"))).toBeDefined();
  });

  it("secret invalide → 401 Unauthorized", async () => {
    const res = await sendRCWebhook("INITIAL_PURCHASE", {
      authHeader: "Bearer WRONG_SECRET",
    });

    expect(res.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
