/**
 * Tests — cron/reschedule-sweep.ts (sweepExpiredRescheduleRequests)
 *
 * Couverts :
 *   Une proposition 'pending' dont expires_at est dépassée passe en
 *     'expired' — sans ça, une proposition jamais consultée restait
 *     'pending' indéfiniment et bloquait l'index unique qui garantit une
 *     seule proposition active par réservation.
 *   Une proposition acceptée juste avant le passage du sweep n'est jamais
 *     écrasée — le WHERE status='pending' de l'UPDATE protège ce cas
 *     (simulé ici en vérifiant que la requête SQL ne matche que 'pending').
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  return { mockExecute };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockExecute }),
}));

import { runRescheduleSweep, sweepExpiredRescheduleRequests } from "../cron/reschedule-sweep";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("sweepExpiredRescheduleRequests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passe en 'expired' les propositions pending dont expires_at est dépassée", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 501 }, { id: 502 }], []]);

    const count = await sweepExpiredRescheduleRequests();

    expect(count).toBe(2);
    const call = mockExecute.mock.calls[0];
    expect(sqlIncludes(call, "UPDATE reschedule_requests", "status = 'expired'", "status = 'pending'", "expires_at < NOW()")).toBe(true);
  });

  it("ne touche à rien s'il n'y a aucune proposition pending expirée", async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const count = await sweepExpiredRescheduleRequests();

    expect(count).toBe(0);
  });

  it("ne modifie jamais une proposition déjà 'accepted' entre-temps — le UPDATE ne cible que status='pending'", async () => {
    // Simule le cas : une proposition a été acceptée juste avant le sweep.
    // Le WHERE status='pending' de la requête SQL garantit que l'UPDATE ne
    // renvoie (RETURNING id) que les lignes encore pending — cette ligne
    // acceptée n'apparaît donc jamais dans le résultat, elle reste 'accepted'.
    mockExecute.mockResolvedValueOnce([[], []]); // aucune ligne 'pending' concernée

    const count = await sweepExpiredRescheduleRequests();

    expect(count).toBe(0);
    const call = mockExecute.mock.calls[0];
    expect(sqlIncludes(call, "status = 'pending'")).toBe(true);
  });

  it("runRescheduleSweep ne lève jamais, même si la requête échoue", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db unreachable"));
    await expect(runRescheduleSweep()).resolves.not.toThrow();
  });
});
