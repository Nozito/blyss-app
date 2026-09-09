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
    refunds = { create: vi.fn().mockResolvedValue({ id: "re_test_123" }) };
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
    // Default: the idempotency SELECT finds no prior event (empty rows),
    // everything else resolves generically. Tests override per-call as needed.
    mockExecute.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("FROM stripe_events")) {
        return Promise.resolve([[], []]);
      }
      return Promise.resolve([{ rowCount: 1 }]);
    });
    mockQuery.mockResolvedValue([[], []]);
  });

  it("payment_intent.succeeded (résa active) → crédite + confirme la réservation", async () => {
    const piId = "pi_test_succeeded_123";
    mockConstructEvent.mockReturnValueOnce({
      type: "payment_intent.succeeded",
      id: "evt_1",
      data: { object: { id: piId } },
    });
    // SELECT payment + reservation status
    mockQuery.mockResolvedValueOnce([
      [{ reservation_id: 42, amount: 150, type: "deposit", reservation_status: "pending" }],
      [],
    ]);

    const res = await sendStripeWebhook();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    const calls = mockExecute.mock.calls as unknown[][];
    const paymentsCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "succeeded"));
    expect(paymentsCall).toBeDefined();
    expect(paymentsCall?.[1]).toContain(piId);

    // Le crédit est conditionné au statut (invariant anti-paiement-tardif).
    const creditCall = calls.find((a) =>
      sqlIncludes(a, "UPDATE reservations", "total_paid", "status IN ('pending', 'confirmed')")
    );
    expect(creditCall).toBeDefined();
    const confirmCall = calls.find((a) => sqlIncludes(a, "UPDATE reservations", "status = 'confirmed'"));
    expect(confirmCall).toBeDefined();
  });

  it("payment_intent.succeeded sur une résa ANNULÉE → aucun crédit, alerte + remboursement", async () => {
    const piId = "pi_test_late_999";
    mockConstructEvent.mockReturnValueOnce({
      type: "payment_intent.succeeded",
      id: "evt_late",
      data: { object: { id: piId } },
    });
    mockQuery.mockResolvedValueOnce([
      [{ reservation_id: 77, amount: 40, type: "deposit", reservation_status: "cancelled" }],
      [],
    ]);
    // initiateRefundsForReservation : 1 paiement succeeded à rembourser
    mockQuery.mockResolvedValueOnce([[{ id: 558 }], []]);

    const res = await sendStripeWebhook();
    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    // Aucun crédit de réservation
    const creditCall = calls.find((a) => sqlIncludes(a, "UPDATE reservations", "total_paid"));
    expect(creditCall).toBeUndefined();
    // Le remboursement idempotent a été tenté (SELECT des paiements à rembourser)
    const refundLookup = (mockQuery.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "FROM payments", "stripe_refund_id IS NULL")
    );
    expect(refundLookup).toBeDefined();
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

  it("charge.refunded intégral → payment refunded + réservation à jour", async () => {
    const piId = "pi_test_refunded_789";
    mockConstructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      id: "evt_3",
      data: { object: { id: "ch_123", payment_intent: piId, amount: 5000, amount_captured: 5000, amount_refunded: 5000 } },
    });
    mockQuery.mockResolvedValueOnce([
      [{ reservation_id: 9, client_id: 3, price: 50, payment_status: "fully_paid" }],
      [],
    ]);
    mockQuery.mockResolvedValueOnce([[{ gross: 50, refunded: 50 }], []]);

    const res = await sendStripeWebhook();
    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const refundedCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "refund_amount"));
    expect(refundedCall).toBeDefined();
    expect(refundedCall?.[1]).toContain(piId);
    // refund_amount = montant réellement remboursé chez Stripe (50 €), fullyRefunded=true
    expect((refundedCall?.[1] as unknown[])?.[0]).toBe(50);
    expect((refundedCall?.[1] as unknown[])?.[1]).toBe(true);
  });

  it("charge.refunded PARTIEL → refund_amount partiel, payment pas 'refunded'", async () => {
    const piId = "pi_test_partial_555";
    mockConstructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      id: "evt_partial",
      data: { object: { id: "ch_555", payment_intent: piId, amount: 8000, amount_captured: 8000, amount_refunded: 3000 } },
    });
    mockQuery.mockResolvedValueOnce([
      [{ reservation_id: 12, client_id: 4, price: 80, payment_status: "fully_paid" }],
      [],
    ]);
    mockQuery.mockResolvedValueOnce([[{ gross: 80, refunded: 30 }], []]);

    const res = await sendStripeWebhook();
    expect(res.status).toBe(200);

    const calls = mockExecute.mock.calls as unknown[][];
    const refundCall = calls.find((a) => sqlIncludes(a, "UPDATE payments", "refund_amount"));
    expect((refundCall?.[1] as unknown[])?.[0]).toBe(30); // 30 € remboursés, pas 80
    expect((refundCall?.[1] as unknown[])?.[1]).toBe(false); // fullyRefunded = false
    // total_paid recalculé = 80 - 30 = 50
    const resaCall = calls.find((a) => sqlIncludes(a, "UPDATE reservations", "total_paid"));
    expect((resaCall?.[1] as unknown[])?.[1]).toBe(50);
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

  it("idempotence : rejouer le même event → 200 les 2 fois, mais le second n'applique aucun effet", async () => {
    const event = {
      type: "payment_intent.payment_failed",
      id: "evt_dup",
      data: { object: { id: "pi_dup" } },
    };

    mockConstructEvent.mockReturnValue(event);

    const res1 = await sendStripeWebhook();
    const failedCallsAfterFirst = (mockExecute.mock.calls as unknown[][]).filter((a) =>
      sqlIncludes(a, "UPDATE payments", "failed")
    ).length;
    expect(failedCallsAfterFirst).toBe(1);

    // Second delivery of the SAME event.id: the idempotency check must now
    // find the row inserted by the first call and skip all side effects.
    mockExecute.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("FROM stripe_events")) {
        return Promise.resolve([[{ event_id: event.id }], []]);
      }
      return Promise.resolve([{ rowCount: 1 }]);
    });

    const res2 = await sendStripeWebhook();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject({ message: "Already processed" });

    // The "UPDATE payments ... failed" side effect must NOT have run again.
    const failedCallsAfterSecond = (mockExecute.mock.calls as unknown[][]).filter((a) =>
      sqlIncludes(a, "UPDATE payments", "failed")
    ).length;
    expect(failedCallsAfterSecond).toBe(1);
  });
});
