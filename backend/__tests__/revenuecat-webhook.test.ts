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
const { mockExecute, mockQuery, mockSendAlert } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const mockSendAlert = vi.fn().mockResolvedValue(undefined);
  return { mockExecute, mockQuery, mockSendAlert };
});

// ─── 1b. Mock lib/alerts — spy on admin-grant-override notifications ──────
vi.mock("../lib/alerts", () => ({
  sendAlert: mockSendAlert,
  track5xx: vi.fn(),
}));

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
  entitlementIds?: string[];
  expirationAtMs?: number | null;
  authHeader?: string;
} = {}) {
  const {
    userId = "42",
    productId = "blyss_start_monthly",
    entitlementIds,
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
        ...(entitlementIds ? { entitlement_ids: entitlementIds } : {}),
        expiration_at_ms: expirationAtMs,
        id: `rc_evt_${Date.now()}_${Math.random()}`,
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
    // Content-aware default: the idempotency check and the "is this user a
    // pro" lookup both go through connection.execute and need actual row
    // shapes to pass — a blanket `[{ rowCount: 1 }]` doesn't destructure into
    // a usable row for either, so every activate/deactivate test silently
    // hit the early "user not applicable" return before reaching any of the
    // SQL assertions below.
    mockExecute.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("FROM revenuecat_events")) {
        return Promise.resolve([[], []]); // no prior event → not a duplicate
      }
      if (typeof sql === "string" && sql.includes("SELECT id, role FROM users")) {
        return Promise.resolve([[{ id: 1, role: "pro" }], []]);
      }
      return Promise.resolve([{ rowCount: 1 }]);
    });
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

  it("plan déduit de entitlement_ids plutôt que du product_id quand les deux sont présents", async () => {
    // product_id ne contient ni "signature" ni "serenite" — sans entitlement_ids,
    // ça retomberait sur "start". entitlement_ids doit prendre le dessus.
    const res = await sendRCWebhook("INITIAL_PURCHASE", {
      userId: "20",
      productId: "blyss_promo_sku_xyz",
      entitlementIds: ["signature"],
      expirationAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const insertCall = calls.find((a) => sqlIncludes(a, "INSERT INTO subscriptions"));
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toContain("signature");
  });

  it("BILLING_ISSUE → aucun changement de statut, notification best-effort tentée", async () => {
    const res = await sendRCWebhook("BILLING_ISSUE", { userId: "21" });

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    expect(calls.find((a) => sqlIncludes(a, "UPDATE users", "pro_status"))).toBeUndefined();
    expect(calls.find((a) => sqlIncludes(a, "UPDATE subscriptions"))).toBeUndefined();
    expect(mockQuery.mock.calls.some((a) => sqlIncludes(a, "INSERT INTO notifications"))).toBe(true);
  });

  it("CANCELLATION qui désactive un abonnement offert par un admin → alerte envoyée", async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT payment_id FROM subscriptions")) {
        return Promise.resolve([[{ payment_id: "admin_grant" }], []]);
      }
      return Promise.resolve([[], []]);
    });

    const res = await sendRCWebhook("CANCELLATION", { userId: "22" });

    expect(res.status).toBe(200);
    expect(mockSendAlert).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("admin-granted"),
      expect.objectContaining({ userId: 22 })
    );
  });

  it("secret invalide → 401 Unauthorized", async () => {
    const res = await sendRCWebhook("INITIAL_PURCHASE", {
      authHeader: "Bearer WRONG_SECRET",
    });

    expect(res.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
