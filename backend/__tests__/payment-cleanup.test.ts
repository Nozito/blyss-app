/**
 * Tests — cron/payment-cleanup.ts
 *
 * Couverts :
 *   expireStalePendingPayments — un paiement 'pending' abandonné > 30 min est
 *     annulé chez Stripe et repasse en 'failed'.
 *   cancelUnpaidReservations — une résa impayée > 30 min est annulée SAUF si
 *     le PaymentIntent est en cours/abouti chez Stripe (garde anti-race).
 *   refundCancelledButPaid — une résa annulée avec un paiement encaissé est
 *     remboursée (rattrapage de la race cron↔webhook).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockQuery, mockPiCancel, mockPiRetrieve, mockInitiateRefunds, mockSendAlert } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
  mockPiCancel: vi.fn(),
  mockPiRetrieve: vi.fn(),
  mockInitiateRefunds: vi.fn(),
  mockSendAlert: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockQuery }),
}));

vi.mock("../lib/stripe", () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockPiCancel, retrieve: mockPiRetrieve } }),
}));

vi.mock("../lib/refunds", () => ({
  initiateRefundsForReservation: (...args: unknown[]) => mockInitiateRefunds(...args),
}));

vi.mock("../lib/alerts", () => ({
  sendAlert: (...args: unknown[]) => mockSendAlert(...args),
}));

import { runPaymentCleanup } from "../cron/payment-cleanup";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

/** Route mockQuery selon la requête (chaque passe du cron a sa forme). */
function routeQuery(handlers: {
  unpaidReservations?: unknown[];
  stalePayments?: unknown[];
  cancelledButPaid?: unknown[];
}) {
  mockQuery.mockImplementation((sql: unknown) => {
    const s = typeof sql === "string" ? sql : "";
    if (s.includes("r.payment_status = 'unpaid'")) {
      return Promise.resolve([handlers.unpaidReservations ?? [], []]);
    }
    if (s.includes("FROM payments") && s.includes("status = 'pending'")) {
      return Promise.resolve([handlers.stalePayments ?? [], []]);
    }
    if (s.includes("r.status = 'cancelled'")) {
      return Promise.resolve([handlers.cancelledButPaid ?? [], []]);
    }
    return Promise.resolve([[], []]);
  });
}

describe("runPaymentCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeQuery({});
    mockExecute.mockResolvedValue([[{ id: 1 }], []]);
    mockPiCancel.mockResolvedValue({});
    mockPiRetrieve.mockResolvedValue({ status: "canceled" });
    mockInitiateRefunds.mockResolvedValue({ refunded: true, totalRefunded: 40, refunds: [], errors: 0 });
    mockSendAlert.mockResolvedValue(undefined);
  });

  it("expireStalePendingPayments : annule le PI Stripe et marque le paiement 'failed'", async () => {
    routeQuery({ stalePayments: [{ id: 42, stripe_payment_intent_id: "pi_abandoned" }] });
    mockExecute.mockResolvedValue([[{ id: 42 }], []]);

    await runPaymentCleanup();

    expect(mockPiCancel).toHaveBeenCalledWith("pi_abandoned");
    const updateCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE payments", "'failed'", "status = 'pending'")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toEqual([42]);
  });

  it("cancelUnpaidReservations : annule la résa quand le PI est 'canceled'", async () => {
    routeQuery({ unpaidReservations: [{ id: 100, last_pi: "pi_dead" }] });
    mockPiRetrieve.mockResolvedValue({ status: "canceled" });

    await runPaymentCleanup();

    expect(mockPiRetrieve).toHaveBeenCalledWith("pi_dead");
    const cancelCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE reservations", "'cancelled'", "cancelled_by = 'system'")
    );
    expect(cancelCall).toBeDefined();
  });

  it("cancelUnpaidReservations : NE PAS annuler si le PI est 'succeeded' (race anti-perte)", async () => {
    routeQuery({ unpaidReservations: [{ id: 101, last_pi: "pi_paying" }] });
    mockPiRetrieve.mockResolvedValue({ status: "succeeded" });

    await runPaymentCleanup();

    const cancelCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE reservations", "'cancelled'", "cancelled_by = 'system'")
    );
    expect(cancelCall).toBeUndefined();
  });

  it("cancelUnpaidReservations : NE PAS annuler si le PI est 'processing'", async () => {
    routeQuery({ unpaidReservations: [{ id: 102, last_pi: "pi_proc" }] });
    mockPiRetrieve.mockResolvedValue({ status: "processing" });

    await runPaymentCleanup();

    const cancelCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE reservations", "'cancelled'")
    );
    expect(cancelCall).toBeUndefined();
  });

  it("cancelUnpaidReservations : PI introuvable → on ne touche rien ce cycle", async () => {
    routeQuery({ unpaidReservations: [{ id: 103, last_pi: "pi_gone" }] });
    mockPiRetrieve.mockRejectedValue(new Error("No such payment_intent"));

    await runPaymentCleanup();

    const cancelCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE reservations", "'cancelled'")
    );
    expect(cancelCall).toBeUndefined();
  });

  it("cancelUnpaidReservations : aucune ligne payments → résa vraiment abandonnée, on annule", async () => {
    routeQuery({ unpaidReservations: [{ id: 104, last_pi: null }] });

    await runPaymentCleanup();

    expect(mockPiRetrieve).not.toHaveBeenCalled();
    const cancelCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE reservations", "'cancelled'")
    );
    expect(cancelCall).toBeDefined();
  });

  it("refundCancelledButPaid : rembourse une résa annulée dont un paiement a abouti", async () => {
    routeQuery({ cancelledButPaid: [{ reservation_id: 200 }] });

    await runPaymentCleanup();

    expect(mockSendAlert).toHaveBeenCalledWith(
      "critical",
      expect.stringContaining("remboursement de rattrapage"),
      expect.objectContaining({ reservationId: 200 })
    );
    expect(mockInitiateRefunds).toHaveBeenCalledWith(200, "requested_by_customer");
  });

  it("ne plante pas si stripe.paymentIntents.cancel rejette", async () => {
    routeQuery({ stalePayments: [{ id: 7, stripe_payment_intent_id: "pi_x" }] });
    mockPiCancel.mockRejectedValueOnce(new Error("already canceled"));

    await expect(runPaymentCleanup()).resolves.not.toThrow();
  });
});
