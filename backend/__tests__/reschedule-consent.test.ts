/**
 * Tests — workflow de consentement client pour le report d'un RDV
 *
 * Couverts :
 *   PATCH /api/pro/appointments/:id
 *     → crée une reschedule_request pending, ne modifie jamais `reservations`
 *     → 404 si réservation d'une autre pro
 *     → 400 si réservation cancelled/completed
 *     → 400 si RDV trop proche pour laisser le temps de répondre
 *     → 409 si une proposition pending existe déjà (contrainte d'unicité)
 *
 *   PATCH /api/client/reschedule-requests/:id/accept
 *     → 200 nominal, reservations mise à jour, request accepted
 *     → 409 SLOT_NO_LONGER_AVAILABLE si conflit à la revalidation, reservation inchangée
 *     → 410 si expirée
 *     → 404 si une autre cliente tente d'accepter (IDOR)
 *
 *   PATCH /api/client/reschedule-requests/:id/decline
 *     → 200, reservation inchangée, request declined
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockConnection, mockTopQuery, mockCheckSlotAvailability } = vi.hoisted(() => {
  const mockConnection = {
    query: vi.fn(),
    execute: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  const mockTopQuery = vi.fn();
  const mockCheckSlotAvailability = vi.fn();
  return { mockConnection, mockTopQuery, mockCheckSlotAvailability };
});

// Le re-check sous verrou de acceptRescheduleRequest appelle désormais le
// moteur complet checkSlotAvailability (revue sécurité M3) — on le mocke pour
// piloter available / reason sans avoir à simuler toutes ses requêtes DB.
vi.mock("../services/availability.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/availability.service")>();
  return { ...actual, checkSlotAvailability: mockCheckSlotAvailability };
});

const AVAILABLE_OK = {
  available: true as const,
  blockedStart: "2030-01-01T09:00:00.000Z",
  blockedEnd: "2030-01-01T10:10:00.000Z",
  visibleEnd: "2030-01-01T10:00:00.000Z",
  serviceDurationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
};

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => {
  class DbTimeoutError extends Error {}
  return {
    DbTimeoutError,
    getDb: () => ({
      query: mockTopQuery,
      execute: mockTopQuery,
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    }),
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

// ─── 5. Import serveur (APRÈS les mocks) ─────────────────────────────────
import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId: number, role: "client" | "pro") {
  return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

const FAR_FUTURE = new Date(Date.now() + 10 * 24 * 3600 * 1000); // dans 10 jours — largement au-delà des 24h

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/pro/appointments/:id — proposition, jamais de mutation directe
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/pro/appointments/:id — crée une proposition, ne mute pas reservations", () => {
  const proToken = makeToken(7, "pro");

  beforeEach(() => {
    vi.clearAllMocks();
    // requireProAccess (server.ts) gate globale sur /api/pro/*
    mockTopQuery.mockResolvedValueOnce([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
  });

  it("202 + insère une reschedule_request, aucune UPDATE reservations émise", async () => {
    mockTopQuery
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            status: "confirmed",
            client_id: 42,
            prestation_id: 3,
            price: 50,
            start_datetime: FAR_FUTURE.toISOString(),
          },
        ],
        [],
      ]) // SELECT reservation
      .mockResolvedValueOnce([[{ id: 501, expires_at: new Date().toISOString() }], []]) // INSERT reschedule_requests
      .mockResolvedValueOnce([[{ id: 900, created_at: new Date().toISOString() }], []]); // INSERT notifications

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.request_id).toBe(501);

    const calls = mockTopQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.includes("INSERT INTO reschedule_requests"))).toBe(true);
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);

    const connectionCalls = mockConnection.query.mock.calls;
    expect(connectionCalls.length).toBe(0); // aucune transaction ouverte sur ce chemin
  });

  it("404 si la réservation appartient à une autre pro", async () => {
    mockTopQuery.mockResolvedValueOnce([[], []]); // SELECT → rien trouvé pour ce pro_id

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("400 si la réservation est déjà annulée/terminée", async () => {
    mockTopQuery.mockResolvedValueOnce([
      [{ id: 1, status: "cancelled", client_id: 42, prestation_id: 3, price: 50, start_datetime: FAR_FUTURE.toISOString() }],
      [],
    ]);

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it("400 si le RDV original est déjà passé/imminent (expires_at calculé <= now)", async () => {
    // RDV commencé il y a 1s : expires_at = min(now+24h, start) = start (passé) <= now → refus
    const almostNow = new Date(Date.now() - 1000);
    mockTopQuery.mockResolvedValueOnce([
      [{ id: 1, status: "confirmed", client_id: 42, prestation_id: 3, price: 50, start_datetime: almostNow.toISOString() }],
      [],
    ]);

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(Date.now() + 1800 * 1000).toISOString(),
        end_datetime: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it("409 si une proposition pending existe déjà pour ce RDV (contrainte d'unicité)", async () => {
    mockTopQuery
      .mockResolvedValueOnce([
        [{ id: 1, status: "confirmed", client_id: 42, prestation_id: 3, price: 50, start_datetime: FAR_FUTURE.toISOString() }],
        [],
      ])
      .mockImplementationOnce(() => {
        throw new Error('duplicate key value violates unique constraint "idx_reschedule_requests_one_pending"');
      });

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
      });

    expect(res.status).toBe(409);
  });

  it("400 si initiated_via='phone' sans motif (validation Zod)", async () => {
    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
        initiated_via: "phone",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("202 : proposition via téléphone avec motif, message de notification distinct", async () => {
    mockTopQuery
      .mockResolvedValueOnce([
        [{ id: 1, status: "confirmed", client_id: 42, prestation_id: 3, price: 50, start_datetime: FAR_FUTURE.toISOString() }],
        [],
      ]) // SELECT reservation
      .mockResolvedValueOnce([[{ id: 501, expires_at: new Date().toISOString() }], []]) // INSERT reschedule_requests
      .mockResolvedValueOnce([[{ id: 900, created_at: new Date().toISOString() }], []]); // INSERT notifications

    const res = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
        initiated_via: "phone",
        reason: "Cliente indisponible, décalé au lendemain",
      });

    expect(res.status).toBe(202);

    const insertCall = mockTopQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO reschedule_requests"));
    expect(insertCall?.[1]).toContain("phone");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/client/reschedule-requests/:id/accept
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/client/reschedule-requests/:id/accept", () => {
  const clientToken = makeToken(42, "client");
  const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

  const baseRequestRow = {
    id: 501,
    reservation_id: 1,
    status: "pending",
    expires_at: futureExpiry,
    proposed_start_datetime: FAR_FUTURE.toISOString(),
    proposed_end_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
    proposed_prestation_id: 3,
    proposed_price: 50,
    pro_id: 7,
    client_id: 42,
  };

  beforeEach(() => vi.clearAllMocks());

  it("200 nominal : reservations mise à jour, request accepted", async () => {
    mockCheckSlotAvailability.mockResolvedValueOnce(AVAILABLE_OK);
    mockTopQuery
      .mockResolvedValueOnce([[baseRequestRow], []]) // loadRequestForClient
      .mockResolvedValueOnce([[{ id: 900, created_at: new Date().toISOString() }], []]); // notif pro

    mockConnection.query
      .mockResolvedValueOnce([[], []]) // advisory lock
      .mockResolvedValueOnce([[{ status: "pending", expires_at: futureExpiry, reservation_status: "confirmed" }], []]) // re-check sous verrou
      .mockResolvedValueOnce([[], []]) // UPDATE reservations
      .mockResolvedValueOnce([[], []]); // UPDATE reschedule_requests accepted

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockCheckSlotAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        proId: 7,
        serviceIds: [3],
        startDatetime: baseRequestRow.proposed_start_datetime,
        excludeReservationId: 1,
        requestedByRole: "pro",
      })
    );

    const calls = mockConnection.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(true);
    expect(mockConnection.commit).toHaveBeenCalled();
  });

  it("409 SLOT_NO_LONGER_AVAILABLE si le moteur refuse le créneau (conflit RDV), reservation inchangée", async () => {
    mockCheckSlotAvailability.mockResolvedValueOnce({ available: false, reason: "overlaps_reservation" });
    mockTopQuery.mockResolvedValueOnce([[baseRequestRow], []]); // loadRequestForClient

    mockConnection.query
      .mockResolvedValueOnce([[], []]) // advisory lock
      .mockResolvedValueOnce([[{ status: "pending", expires_at: futureExpiry, reservation_status: "confirmed" }], []]) // re-check
      .mockResolvedValueOnce([[], []]); // UPDATE reschedule_requests → expired

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SLOT_NO_LONGER_AVAILABLE");

    const calls = mockConnection.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);
    expect(mockConnection.commit).toHaveBeenCalled(); // commit du changement de statut de la request uniquement
  });

  it("409 si le moteur refuse : créneau chevauchant une ABSENCE (que l'ancien re-check ignorait — M3)", async () => {
    mockCheckSlotAvailability.mockResolvedValueOnce({ available: false, reason: "overlaps_unavailability" });
    mockTopQuery.mockResolvedValueOnce([[baseRequestRow], []]);

    mockConnection.query
      .mockResolvedValueOnce([[], []]) // advisory lock
      .mockResolvedValueOnce([[{ status: "pending", expires_at: futureExpiry, reservation_status: "confirmed" }], []]) // re-check
      .mockResolvedValueOnce([[], []]); // UPDATE reschedule_requests → expired

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SLOT_NO_LONGER_AVAILABLE");
    expect(res.body.message).toMatch(/absence/i);
    const calls = mockConnection.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);
  });

  it("409 si le moteur refuse : créneau HORS horaires d'ouverture (que l'ancien re-check ignorait — M3)", async () => {
    mockCheckSlotAvailability.mockResolvedValueOnce({ available: false, reason: "outside_hours" });
    mockTopQuery.mockResolvedValueOnce([[baseRequestRow], []]);

    mockConnection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ status: "pending", expires_at: futureExpiry, reservation_status: "confirmed" }], []])
      .mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/horaires/i);
  });

  it("409 si la réservation a été annulée entre la proposition et la tentative d'acceptation", async () => {
    mockTopQuery.mockResolvedValueOnce([[baseRequestRow], []]); // loadRequestForClient

    mockConnection.query
      .mockResolvedValueOnce([[], []]) // advisory lock
      .mockResolvedValueOnce([[{ status: "pending", expires_at: futureExpiry, reservation_status: "cancelled" }], []]) // re-check : reservation annulée entre-temps
      .mockResolvedValueOnce([[], []]); // UPDATE reschedule_requests → expired

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(409);

    const calls = mockConnection.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);
  });

  it("410 si la proposition a expiré", async () => {
    const expiredRow = { ...baseRequestRow, expires_at: new Date(Date.now() - 1000).toISOString() };
    mockTopQuery
      .mockResolvedValueOnce([[expiredRow], []]) // loadRequestForClient
      .mockResolvedValueOnce([[], []]); // UPDATE status = expired

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(410);
    expect(mockConnection.query).not.toHaveBeenCalled(); // jamais entré en transaction
  });

  it("404 si une autre cliente tente d'accepter (IDOR)", async () => {
    mockTopQuery.mockResolvedValueOnce([[], []]); // JOIN filtré sur client_id → rien trouvé

    const otherClientToken = makeToken(999, "client");
    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/accept")
      .set("Cookie", `access_token=${otherClientToken}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/client/reschedule-requests/:id/decline
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/client/reschedule-requests/:id/decline", () => {
  const clientToken = makeToken(42, "client");

  const pendingRow = {
    id: 501,
    reservation_id: 1,
    status: "pending",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    proposed_start_datetime: FAR_FUTURE.toISOString(),
    proposed_end_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
    proposed_prestation_id: 3,
    proposed_price: 50,
    pro_id: 7,
    client_id: 42,
  };

  beforeEach(() => vi.clearAllMocks());

  it("200, reservation inchangée, request declined", async () => {
    mockTopQuery
      .mockResolvedValueOnce([[pendingRow], []]) // loadRequestForClient
      .mockResolvedValueOnce([[{ id: 501 }], []]) // UPDATE status = declined ... RETURNING id
      .mockResolvedValueOnce([[{ id: 900, created_at: new Date().toISOString() }], []]); // notif pro

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/decline")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const calls = mockTopQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);
    expect(mockConnection.query).not.toHaveBeenCalled(); // pas de transaction nécessaire pour un refus
  });

  it("409 si un accept concurrent a déjà traité la proposition (pas d'écrasement du statut)", async () => {
    mockTopQuery
      .mockResolvedValueOnce([[pendingRow], []]) // loadRequestForClient (encore 'pending' à la lecture)
      .mockResolvedValueOnce([[], []]); // UPDATE ... WHERE status='pending' → 0 ligne (déjà accepted entre-temps)

    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/decline")
      .set("Cookie", `access_token=${clientToken}`);

    expect(res.status).toBe(409);
  });

  it("404 si une autre cliente tente de refuser (IDOR)", async () => {
    mockTopQuery.mockResolvedValueOnce([[], []]);

    const otherClientToken = makeToken(999, "client");
    const res = await request(app)
      .patch("/api/client/reschedule-requests/501/decline")
      .set("Cookie", `access_token=${otherClientToken}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Parcours complet canal téléphone : création → refus → RDV initial inchangé
// ═══════════════════════════════════════════════════════════════════════════
describe("Report proposé par téléphone, refusé par la cliente", () => {
  const proToken = makeToken(7, "pro");
  const clientToken = makeToken(42, "client");

  beforeEach(() => vi.clearAllMocks());

  it("crée la proposition avec motif, la cliente la refuse, le RDV initial reste inchangé", async () => {
    // ── 1. La pro crée la proposition via téléphone ──────────────────────
    mockTopQuery
      .mockResolvedValueOnce([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]) // requireProAccess
      .mockResolvedValueOnce([
        [{ id: 1, status: "confirmed", client_id: 42, prestation_id: 3, price: 50, start_datetime: FAR_FUTURE.toISOString() }],
        [],
      ]) // SELECT reservation
      .mockResolvedValueOnce([[{ id: 777, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() }], []]) // INSERT reschedule_requests
      .mockResolvedValueOnce([[{ id: 900, created_at: new Date().toISOString() }], []]); // INSERT notifications (client)

    const createRes = await request(app)
      .patch("/api/pro/appointments/1")
      .set("Cookie", `access_token=${proToken}`)
      .send({
        start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
        end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
        initiated_via: "phone",
        reason: "Accord donné par téléphone, cliente indisponible sur son créneau initial",
      });

    expect(createRes.status).toBe(202);
    expect(createRes.body.request_id).toBe(777);

    // Aucune mutation de reservations à la création
    const createCalls = mockTopQuery.mock.calls.map((c) => String(c[0]));
    expect(createCalls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);

    // ── 2. La cliente refuse ──────────────────────────────────────────────
    mockTopQuery
      .mockResolvedValueOnce([
        [
          {
            id: 777,
            reservation_id: 1,
            status: "pending",
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            proposed_start_datetime: new Date(FAR_FUTURE.getTime() + 3600 * 1000).toISOString(),
            proposed_end_datetime: new Date(FAR_FUTURE.getTime() + 2 * 3600 * 1000).toISOString(),
            proposed_prestation_id: 3,
            proposed_price: 50,
            pro_id: 7,
            client_id: 42,
          },
        ],
        [],
      ]) // loadRequestForClient
      .mockResolvedValueOnce([[{ id: 777 }], []]) // UPDATE status='declined' ... RETURNING id
      .mockResolvedValueOnce([[{ id: 901, created_at: new Date().toISOString() }], []]); // notif pro

    const declineRes = await request(app)
      .patch("/api/client/reschedule-requests/777/decline")
      .set("Cookie", `access_token=${clientToken}`);

    expect(declineRes.status).toBe(200);

    // Le RDV initial n'a jamais été touché : aucun UPDATE reservations
    // n'apparaît dans les appels top-level ni ceux d'une connexion transactionnelle
    // (le refus ne passe même pas par une transaction).
    const declineCalls = mockTopQuery.mock.calls.map((c) => String(c[0]));
    expect(declineCalls.some((sql) => sql.toUpperCase().includes("UPDATE RESERVATIONS"))).toBe(false);
    expect(mockConnection.query).not.toHaveBeenCalled();
  });
});
