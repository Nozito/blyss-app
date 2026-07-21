/**
 * Tests — cron/data-retention.ts (deleteInactiveAccounts behavior)
 *
 * Couverts :
 *   Un utilisateur sans historique est supprimé (DELETE réussit)
 *   Un utilisateur avec historique (violation FK) est anonymisé au lieu
 *     de bloquer tout le lot — c'est le point que ce fichier corrige :
 *     avant, un seul échec de DELETE dans le batch faisait échouer TOUT
 *     le batch (DELETE en masse atomique), donc personne n'était jamais
 *     supprimé tant qu'un utilisateur avec historique matchait le WHERE.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockQuery }),
}));

import { runDataRetentionCycle } from "../cron/data-retention";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("runDataRetentionCycle — deleteInactiveAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockQuery.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT id, email, first_name FROM users")) {
        return Promise.resolve([[], []]); // pas de préavis à envoyer dans ce test
      }
      if (typeof sql === "string" && sql.includes("SELECT id FROM users")) {
        return Promise.resolve([[{ id: 1 }, { id: 2 }], []]); // 2 candidats à la suppression
      }
      return Promise.resolve([[], []]);
    });

    mockExecute.mockImplementation((sql: unknown, params?: unknown[]) => {
      if (typeof sql === "string" && sql.includes("DELETE FROM users WHERE id = ?")) {
        const id = params?.[0];
        if (id === 2) {
          // Simule une violation de contrainte FK (historique de réservations/paiements)
          return Promise.reject(Object.assign(new Error("foreign key violation"), { code: "23503" }));
        }
        return Promise.resolve([{ rowCount: 1 }]);
      }
      if (typeof sql === "string" && sql.includes("UPDATE users SET") && sql.includes("first_name = 'Compte'")) {
        return Promise.resolve([{ rowCount: 1 }]);
      }
      return Promise.resolve([{ rowCount: 0 }]);
    });
  });

  it("supprime l'utilisateur sans historique ET anonymise celui bloqué par une contrainte FK, sans que l'un bloque l'autre", async () => {
    await runDataRetentionCycle();

    const executeCalls = mockExecute.mock.calls as unknown[][];

    // L'utilisateur 1 : DELETE tenté et réussi
    const delete1 = executeCalls.find(
      (a) => sqlIncludes(a, "DELETE FROM users WHERE id = ?") && (a[1] as unknown[])?.[0] === 1
    );
    expect(delete1).toBeDefined();

    // L'utilisateur 2 : DELETE tenté (et rejeté), PUIS anonymisé — pas juste abandonné
    const delete2 = executeCalls.find(
      (a) => sqlIncludes(a, "DELETE FROM users WHERE id = ?") && (a[1] as unknown[])?.[0] === 2
    );
    expect(delete2).toBeDefined();

    const anonymize2 = executeCalls.find(
      (a) =>
        sqlIncludes(a, "UPDATE users SET", "first_name = 'Compte'") &&
        (a[1] as unknown[])?.[0] === 2
    );
    expect(anonymize2).toBeDefined();
  });
});
