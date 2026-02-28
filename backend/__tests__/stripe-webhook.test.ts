/**
 * Tests — Stripe Webhook handler
 *
 * Couverts :
 *   payment_intent.succeeded  → UPDATE payments + UPDATE reservations
 *   payment_intent.payment_failed → UPDATE payments
 *   charge.refunded → UPDATE payments
 *   Signature invalide → 400
 *   Event type inconnu → 200 (ignoré)
 *   Idempotence → 200 les 2 fois
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── 1. Mocks hoistés ──────────────────────────────────────────────────────
const { mockConstructEvent, mockExecute, mockQuery } = vi.hoisted(() => {
  const mockConstructEvent = vi.fn();
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockConstructEvent, mockExecute, mockQuery };
});

// ─── 2. Mock Stripe ────────────────────────────────────────────────────────
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: mockConstructEvent };
    paymentIntents = { create: vi.fn(), retrieve: vi.fn() };
    accounts = { retrieve: vi.fn() };
    accountLinks = { create: vi.fn() };
  },
}));

// ─── 3. Mock lib/db ────────────────────────────────────────────────────────
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

/** Helper: check if mock call args[0] is a SQL string containing all fragments */
function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

/** Envoie une requête simulée au webhook Stripe avec un body raw */
function sendStripeWebhook(body: object = {}) {
  return request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1234,v1=test-sig")
    .send(Buffer.from(JSON.stringify(body)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ rowCount: 1 }]);
    mockQuery.mockResolvedValue([[], []]);
  });

  it("payment_intent.succeeded → UPDATE payments + UPDATE reservations", async () => {
    const piId = "pi_test_succeeded_123";
    mockConstructEvent.mockReturnValueOnce({
      type: "payment_intent.succeeded",
      id: "evt_1",
      data: { object: { id: piId } },
    });
    // SELECT payment rows
    mockQuery.mockResolvedValueOnce([
      [{ reservation_id: 42, amount: 150, type: "deposit" }],
      [],
    ]);

    const res = await sendStripeWebhook();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    const calls = mockExecute.mock.calls as unknown[][];
    const paymentsCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "succeeded"));
    expect(paymentsCall).toBeDefined();
    expect(paymentsCall?.[1]).toContain(piId);

    const reservationsCall = calls.find((a) => sqlIncludes(a, "UPDATE reservations"));
    expect(reservationsCall).toBeDefined();
  });

  it("payment_intent.payment_failed → UPDATE payments SET status='failed'", async () => {
    const piId = "pi_test_failed_456";
    mockConstructEvent.mockReturnValueOnce({
      type: "payment_intent.payment_failed",
      id: "evt_2",
      data: { object: { id: piId } },
    });

    const res = await sendStripeWebhook();

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const failedCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "failed"));
    expect(failedCall).toBeDefined();
    expect(failedCall?.[1]).toContain(piId);
  });

  it("charge.refunded → UPDATE payments SET status='refunded'", async () => {
    const piId = "pi_test_refunded_789";
    mockConstructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      id: "evt_3",
      data: { object: { id: "ch_123", payment_intent: piId } },
    });

    const res = await sendStripeWebhook();

    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const refundedCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "refunded"));
    expect(refundedCall).toBeDefined();
    expect(refundedCall?.[1]).toContain(piId);
  });

  it("signature invalide → 400 { error: 'Invalid signature' }", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await sendStripeWebhook();

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid signature" });
  });

  it("event type inconnu → 200 (ignoré silencieusement)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "customer.subscription.deleted",
      id: "evt_unknown",
      data: { object: {} },
    });

    const res = await sendStripeWebhook();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
  });

  it("idempotence : rejouer le même event → 200 les 2 fois", async () => {
    const event = {
      type: "payment_intent.payment_failed",
      id: "evt_dup",
      data: { object: { id: "pi_dup" } },
    };

    mockConstructEvent.mockReturnValue(event);

    const res1 = await sendStripeWebhook();
    const res2 = await sendStripeWebhook();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // mockExecute appelé au moins 2 fois (une par requête)
    expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
