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

// ─────────────────────────────────────────────────────────────────────────────

describe("runDataRetentionCycle — messages, avis, audit_log", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockQuery.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT id, email, first_name FROM users")) {
        return Promise.resolve([[], []]);
      }
      if (typeof sql === "string" && sql.includes("SELECT id FROM users")) {
        return Promise.resolve([[], []]); // pas de comptes inactifs dans ce test
      }
      if (typeof sql === "string" && sql.includes("FROM messages")) {
        return Promise.resolve([
          [
            { id: 1, attachment_url: "/uploads/chat/old.jpg", attachment_thumbnail: "/uploads/chat/old_thumb.jpg" },
            { id: 2, attachment_url: null, attachment_thumbnail: null },
          ],
          [],
        ]);
      }
      return Promise.resolve([[], []]);
    });

    mockExecute.mockImplementation((sql: unknown) => {
      if (typeof sql === "string" && sql.includes("DELETE FROM messages WHERE id = ANY(?)")) {
        return Promise.resolve([{ rowCount: 2 }]);
      }
      if (typeof sql === "string" && sql.includes("UPDATE reviews SET comment = NULL")) {
        return Promise.resolve([{ rowCount: 3 }]);
      }
      if (typeof sql === "string" && sql.includes("DELETE FROM audit_log WHERE executed_at")) {
        return Promise.resolve([{ rowCount: 5 }]);
      }
      return Promise.resolve([{ rowCount: 0 }]);
    });
  });

  it("purge les messages > 3 ans (avec leurs pièces jointes), anonymise les avis > 5 ans et purge audit_log > 12 mois", async () => {
    await runDataRetentionCycle();

    const executeCalls = mockExecute.mock.calls as unknown[][];

    const deleteMessages = executeCalls.find((a) => sqlIncludes(a, "DELETE FROM messages WHERE id = ANY(?)"));
    expect(deleteMessages).toBeDefined();
    expect(deleteMessages?.[1]).toEqual([[1, 2]]);

    const anonymizeReviews = executeCalls.find((a) => sqlIncludes(a, "UPDATE reviews SET comment = NULL"));
    expect(anonymizeReviews).toBeDefined();

    const purgeAuditLog = executeCalls.find((a) => sqlIncludes(a, "DELETE FROM audit_log WHERE executed_at"));
    expect(purgeAuditLog).toBeDefined();
  });
});
