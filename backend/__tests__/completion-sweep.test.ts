/**
 * Tests — cron/completion-sweep.ts (sweepPastConfirmedReservations)
 *
 * Couverts :
 *   Une réservation 'confirmed' dont end_datetime est dépassée de plus de
 *     24h passe en 'completed' — sans ça (oubli de la pro), la cliente ne
 *     voit jamais le bouton « Laisser un avis ».
 *   Le WHERE status='confirmed' de l'UPDATE protège une réservation qu'une
 *     pro a entre-temps marquée completed/no-show/annulée elle-même.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  return { mockExecute };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockExecute }),
}));

import { runCompletionSweep, sweepPastConfirmedReservations } from "../cron/completion-sweep";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("sweepPastConfirmedReservations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passe en 'completed' les réservations confirmed dont la fin est dépassée depuis plus de 24h", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 701 }, { id: 702 }], []]);

    const count = await sweepPastConfirmedReservations();

    expect(count).toBe(2);
    const call = mockExecute.mock.calls[0];
    expect(
      sqlIncludes(
        call,
        "UPDATE reservations",
        "status = 'completed'",
        "status = 'confirmed'",
        "end_datetime < NOW()",
        "MAKE_INTERVAL(hours => 24)"
      )
    ).toBe(true);
  });

  it("ne touche à rien s'il n'y a aucune réservation confirmed passée", async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const count = await sweepPastConfirmedReservations();

    expect(count).toBe(0);
  });

  it("ne modifie jamais une réservation déjà finalisée entre-temps par la pro — l'UPDATE ne cible que status='confirmed'", async () => {
    // Simule le cas : la pro a marqué le RDV no-show/completed juste avant
    // le sweep. Le WHERE status='confirmed' garantit que l'UPDATE ne
    // renvoie (RETURNING id) que les lignes encore confirmed.
    mockExecute.mockResolvedValueOnce([[], []]);

    const count = await sweepPastConfirmedReservations();

    expect(count).toBe(0);
    const call = mockExecute.mock.calls[0];
    expect(sqlIncludes(call, "status = 'confirmed'")).toBe(true);
  });

  it("runCompletionSweep ne lève jamais, même si la requête échoue", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db unreachable"));
    await expect(runCompletionSweep()).resolves.not.toThrow();
  });
});
