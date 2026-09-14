/**
 * Tests — lib/reminders.ts (sendPostReminders)
 *
 * Couvre le "rappel post-prestation" (feature grid : Sérénité/Signature
 * uniquement) — signalé par l'utilisateur le 2026-09-14 comme invérifiable
 * manuellement (aucun toggle mobile, le cron s'exécute automatiquement).
 * La preuve d'exclusion Start se fait ici sur la requête SQL générée elle-même
 * (comme completion-sweep.test.ts), pas juste sur le comportement observé —
 * le filtre de palier vit dans le WHERE de la requête qui CLAIM les lignes
 * (POST_CLAIM_QUERY), pas dans une vérification JS après coup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ query: mockQuery, execute: mockQuery }),
}));
vi.mock("../lib/push", () => ({
  sendPushToUser: vi.fn(),
  sendExpoPushToUsers: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendPostReminders } from "../lib/reminders";

function sqlIncludes(args: unknown[], ...fragments: string[]): boolean {
  const sql = args[0];
  if (typeof sql !== "string") return false;
  return fragments.every((f) => sql.includes(f));
}

describe("sendPostReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("la requête qui CLAIM les rappels post-prestation exclut le palier Start (filtre en base, pas en JS)", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // aucune ligne réclamée dans ce run

    await sendPostReminders();

    const call = mockQuery.mock.calls[0];
    expect(
      sqlIncludes(
        call,
        "r.status = 'completed'",
        "r.end_datetime <= (NOW() - INTERVAL '24 hours')",
        "r.reminder_post_sent = false",
        "FROM subscriptions s",
        "s.client_id = r.pro_id",
        "s.status = 'active'",
        "s.plan IN ('serenite', 'signature')"
      )
    ).toBe(true);
    // Start n'apparaît dans aucune clause d'inclusion — seul un pro
    // serenite/signature actif peut satisfaire le EXISTS.
    expect(call[0]).not.toMatch(/'start'/);
  });

  it("n'envoie aucune notification quand la requête ne réclame aucune ligne (ex. seuls des pros Start ont des RDV terminés)", async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await sendPostReminders();

    // Un seul appel DB (le CLAIM) — aucun INSERT INTO notifications derrière.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("envoie bien un rappel pour une ligne réclamée (palier déjà filtré en amont par la requête)", async () => {
    mockQuery
      .mockResolvedValueOnce([[
        { id: 1, client_id: 42, pro_id: 75, prestation_name: "Pose gel", pro_name: "Sophie" },
      ]])
      .mockResolvedValueOnce([[]]); // INSERT INTO notifications

    await sendPostReminders();

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockQuery.mock.calls[1];
    expect(sqlIncludes(insertCall, "INSERT INTO notifications", "post_appointment")).toBe(true);
  });
});
