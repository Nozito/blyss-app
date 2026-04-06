/**
 * Tests — Politique d'annulation
 *
 * Couverts :
 *   Utilitaires purs  → canCancelAppointment / getCancellationDeadline
 *                       cas limites : exactement à la limite, 1 min avant/après
 *                       noticeHours = 0 (annulation toujours possible)
 *
 *   PATCH /api/pro/settings/cancellation-policy
 *                     → validation Zod (valeurs hors liste, manquant)
 *                     → refus si rôle ≠ pro
 *                     → succès (200)
 *
 *   POST /api/reservations/:id/cancel
 *                     → 400 si id invalide
 *                     → 404 si réservation inconnue / autre client
 *                     → 409 si statut déjà terminé/annulé
 *                     → 422 si hors délai (cancellation_window_expired)
 *                     → 200 + libération slot si succès
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import {
  canCancelAppointment,
  getCancellationDeadline,
  CancellationWindowExpiredError,
} from "../lib/cancellation";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => {
  class DbTimeoutError extends Error {}
  return {
    DbTimeoutError,
    getDb: () => ({ query: mockQuery, execute: mockQuery }),
  };
});

// ─── 3. Mock lib/notifications ───────────────────────────────────────────
vi.mock("../lib/notifications", () => ({
  connectedClients: new Map(),
  sendNotificationToUser: vi.fn().mockResolvedValue(true),
  sendUnreadNotifications: vi.fn(),
  broadcastNotification: vi.fn(),
}));

// ─── 4. Mock Stripe ───────────────────────────────────────────────────────
vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

// ─── 5. Mock InstagramService ─────────────────────────────────────────────
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

// ─── 6. Import app (APRÈS les mocks) ─────────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId: number, role: "client" | "pro") {
  return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilitaires purs — canCancelAppointment / getCancellationDeadline
// ═══════════════════════════════════════════════════════════════════════════

describe("getCancellationDeadline", () => {
  it("retourne startAt - noticeHours", () => {
    const start = new Date("2027-06-01T14:00:00.000Z");
    const deadline = getCancellationDeadline(start, 24);
    expect(deadline.toISOString()).toBe("2027-05-31T14:00:00.000Z");
  });

  it("noticeHours = 0 → deadline = startAt", () => {
    const start = new Date("2027-06-01T14:00:00.000Z");
    const deadline = getCancellationDeadline(start, 0);
    expect(deadline.getTime()).toBe(start.getTime());
  });

  it("lève RangeError si noticeHours négatif", () => {
    expect(() => getCancellationDeadline(new Date(), -1)).toThrow(RangeError);
  });
});

describe("canCancelAppointment", () => {
  // RDV dans 30 heures
  const start = new Date("2027-06-02T12:00:00.000Z");
  const notice = 24; // 24h de délai

  it("autorisé quand now est bien avant la deadline", () => {
    // now = 31h avant le RDV → 7h avant la deadline
    const now = new Date(start.getTime() - 31 * 3600 * 1000);
    expect(canCancelAppointment(start, notice, now)).toBe(true);
  });

  it("refusé quand now est après la deadline (1 min après)", () => {
    const deadline = getCancellationDeadline(start, notice);
    const now = new Date(deadline.getTime() + 60 * 1000); // +1 min
    expect(canCancelAppointment(start, notice, now)).toBe(false);
  });

  it("refusé exactement à la deadline (cas limite sécuritaire)", () => {
    const deadline = getCancellationDeadline(start, notice);
    expect(canCancelAppointment(start, notice, deadline)).toBe(false);
  });

  it("autorisé 1 minute AVANT la deadline (cas limite)", () => {
    const deadline = getCancellationDeadline(start, notice);
    const now = new Date(deadline.getTime() - 60 * 1000); // -1 min
    expect(canCancelAppointment(start, notice, now)).toBe(true);
  });

  it("noticeHours = 0 → autorisé si now < startAt", () => {
    const now = new Date(start.getTime() - 1000);
    expect(canCancelAppointment(start, 0, now)).toBe(true);
  });

  it("noticeHours = 0 → refusé si now >= startAt", () => {
    expect(canCancelAppointment(start, 0, start)).toBe(false);
    const now = new Date(start.getTime() + 1000);
    expect(canCancelAppointment(start, 0, now)).toBe(false);
  });

  it("lève RangeError si noticeHours invalide", () => {
    expect(() => canCancelAppointment(start, NaN)).toThrow(RangeError);
  });
});

describe("CancellationWindowExpiredError", () => {
  it("a le bon code et la bonne deadline", () => {
    const deadline = new Date("2027-06-01T10:00:00.000Z");
    const err = new CancellationWindowExpiredError(deadline);
    expect(err.code).toBe("cancellation_window_expired");
    expect(err.deadline).toBe(deadline);
    expect(err).toBeInstanceOf(Error);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/pro/settings/cancellation-policy — Validation Zod
// ═══════════════════════════════════════════════════════════════════════════

describe("PATCH /api/pro/settings/cancellation-policy — validation", () => {
  beforeEach(() => mockQuery.mockReset());

  it("400 si valeur absente", async () => {
    const token = makeToken(1, "pro");
    const res = await request(app)
      .patch("/api/pro/settings/cancellation-policy")
      .set("Cookie", `access_token=${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 si valeur hors liste (ex: 10)", async () => {
    const token = makeToken(1, "pro");
    const res = await request(app)
      .patch("/api/pro/settings/cancellation-policy")
      .set("Cookie", `access_token=${token}`)
      .send({ cancellation_notice_hours: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("403 si rôle client", async () => {
    // Mock : SELECT role → client
    mockQuery.mockResolvedValueOnce([[{ role: "client" }], []]);
    const token = makeToken(1, "client");
    const res = await request(app)
      .patch("/api/pro/settings/cancellation-policy")
      .set("Cookie", `access_token=${token}`)
      .send({ cancellation_notice_hours: 24 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

describe("PATCH /api/pro/settings/cancellation-policy — succès", () => {
  beforeEach(() => {
    // Séquence : 1. SELECT role → pro  2. UPDATE users
    mockQuery
      .mockResolvedValueOnce([[{ role: "pro" }], []])   // vérification rôle
      .mockResolvedValue([[], []]);                      // UPDATE
  });

  it("200 avec une valeur valide (24h)", async () => {
    const token = makeToken(7, "pro");
    const res = await request(app)
      .patch("/api/pro/settings/cancellation-policy")
      .set("Cookie", `access_token=${token}`)
      .send({ cancellation_notice_hours: 24 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cancellation_notice_hours).toBe(24);
  });

  it("200 avec 0 (annulation toujours possible)", async () => {
    const token = makeToken(7, "pro");
    const res = await request(app)
      .patch("/api/pro/settings/cancellation-policy")
      .set("Cookie", `access_token=${token}`)
      .send({ cancellation_notice_hours: 0 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/reservations/:id/cancel
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/reservations/:id/cancel — validation / erreurs", () => {
  beforeEach(() => mockQuery.mockReset());

  it("400 si id non numérique", async () => {
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/abc/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_param");
  });

  it("404 si réservation introuvable", async () => {
    mockQuery.mockResolvedValue([[], []]); // aucune ligne
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/999/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(404);
  });

  it("404 si réservation appartient à un autre client (IDOR protection)", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          id: 5,
          client_id: 99, // ≠ clientId=42
          pro_id: 7,
          status: "confirmed",
          start_datetime: new Date(Date.now() + 48 * 3600 * 1000),
          slot_id: null,
          cancellation_notice_hours: 24,
        },
      ],
      [],
    ]);
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/5/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(404); // pas de révélation d'existence
  });

  it("409 si statut déjà 'cancelled'", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          id: 5,
          client_id: 42,
          pro_id: 7,
          status: "cancelled",
          start_datetime: new Date(Date.now() + 48 * 3600 * 1000),
          slot_id: null,
          cancellation_notice_hours: 24,
        },
      ],
      [],
    ]);
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/5/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_status");
  });

  it("422 si hors délai (cancellation_window_expired)", async () => {
    // RDV dans 2h, délai = 24h → impossible
    mockQuery.mockResolvedValue([
      [
        {
          id: 5,
          client_id: 42,
          pro_id: 7,
          status: "confirmed",
          start_datetime: new Date(Date.now() + 2 * 3600 * 1000),
          slot_id: null,
          cancellation_notice_hours: 24,
        },
      ],
      [],
    ]);
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/5/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("cancellation_window_expired");
    expect(res.body.deadline).toBeDefined();
  });
});

describe("POST /api/reservations/:id/cancel — succès", () => {
  beforeEach(() => {
    // Séquence :
    //   1. SELECT réservation + policy → ligne existante
    //   2. UPDATE reservations
    //   3. UPDATE slots (slot_id non null)
    //   4. INSERT notification → RETURNING
    mockQuery
      .mockResolvedValueOnce([
        [
          {
            id: 5,
            client_id: 42,
            pro_id: 7,
            status: "confirmed",
            start_datetime: new Date(Date.now() + 48 * 3600 * 1000),
            slot_id: 11,
            cancellation_notice_hours: 24,
          },
        ],
        [],
      ])
      .mockResolvedValue([
        [{ id: 1, created_at: new Date().toISOString() }],
        [],
      ]);
  });

  it("200 + libère le slot", async () => {
    const token = makeToken(42, "client");
    const res = await request(app)
      .post("/api/reservations/5/cancel")
      .set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reservation_id).toBe(5);
    // Vérifie que la libération du slot a bien été appelée
    const calls = mockQuery.mock.calls
      .map((c) => c[0])
      .filter((sql): sql is string => typeof sql === "string");
    expect(calls.some((sql) => sql.includes("UPDATE slots"))).toBe(true);
  });
});
