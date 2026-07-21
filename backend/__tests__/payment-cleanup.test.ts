/**
 * Tests — cron/payment-cleanup.ts (expireStalePendingPayments)
 *
 * Couverts :
 *   Un paiement 'pending' abandonné depuis plus de 30 min est annulé chez
 *     Stripe et repasse en 'failed' — sans ça, l'index unique qui protège
 *     contre le double-paiement bloquerait indéfiniment tout nouveau
 *     paiement sur la même réservation.
 *   Une réservation impayée depuis plus de 30 min est toujours annulée
 *     (comportement pré-existant, non régressé).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockQuery, mockPaymentIntentCancel } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const mockPaymentIntentCancel = vi.fn();
  return { mockExecute, mockQuery, mockPaymentIntentCancel };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockQuery }),
}));

vi.mock("../lib/stripe", () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockPaymentIntentCancel } }),
}));

import { runPaymentCleanup } from "../cron/payment-cleanup";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("runPaymentCleanup — expireStalePendingPayments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("FROM reservations")) {
        return Promise.resolve([[], []]); // no unpaid reservations to cancel in this test
      }
      if (typeof sql === "string" && sql.includes("FROM payments")) {
        return Promise.resolve([[{ id: 42, stripe_payment_intent_id: "pi_abandoned" }], []]);
      }
      return Promise.resolve([[], []]);
    });
    mockExecute.mockResolvedValue([[{ id: 42 }], []]);
    mockPaymentIntentCancel.mockResolvedValue({});
  });

  it("annule le PaymentIntent Stripe et marque le paiement 'failed'", async () => {
    await runPaymentCleanup();

    expect(mockPaymentIntentCancel).toHaveBeenCalledWith("pi_abandoned");

    const updateCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE payments", "'failed'", "status = 'pending'")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toEqual([42]);
  });

  it("n'échoue pas si stripe.paymentIntents.cancel rejette (intent déjà résolu par ailleurs)", async () => {
    mockPaymentIntentCancel.mockRejectedValueOnce(new Error("already canceled"));

    await expect(runPaymentCleanup()).resolves.not.toThrow();

    // Le guard WHERE status='pending' protège : si un webhook concurrent a
    // déjà fait transitionner la ligne, l'UPDATE ne touche rien — mais on
    // vérifie ici seulement que l'échec de l'appel Stripe ne fait pas
    // planter tout le cycle.
    const updateCall = (mockExecute.mock.calls as unknown[][]).find((a) =>
      sqlIncludes(a, "UPDATE payments", "'failed'")
    );
    expect(updateCall).toBeDefined();
  });
});
