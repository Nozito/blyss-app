/**
 * Tests d'intégration — POST /api/pro/appointments (ajout manuel pro, 3.4)
 *
 * L'endpoint est une fine couche HTTP au-dessus de reservation.service
 * (mocké ici). On vérifie : contrôle d'accès, mapping des erreurs du service
 * → HTTP, transmission correcte des overrides, structure de réponse.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockQuery, mockCreateReservation } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCreateReservation: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({ query: mockQuery, execute: mockQuery, getConnection: vi.fn() }),
}));

vi.mock("../services/reservation.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/reservation.service")>();
  return { ...actual, createReservation: mockCreateReservation };
});

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
const proToken = (id = 7) => jwt.sign({ id, role: "pro" }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });

const FAR = new Date(Date.now() + 20 * 24 * 3600 * 1000);
const validBody = {
  client_id: 42,
  prestation_id: 10,
  start_datetime: FAR.toISOString(),
  end_datetime: new Date(FAR.getTime() + 3600 * 1000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // requireProAccess (gate globale /api/pro/*) puis lookup cliente.
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes("SELECT role, is_admin, pro_status")) {
      return Promise.resolve([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
    }
    // Contrôle d'accès RGPD : relation confirmed/completed pro ↔ cliente.
    if (sql.includes("FROM reservations") && sql.includes("status IN ('confirmed','completed')")) {
      return Promise.resolve([[{ ok: 1 }], []]);
    }
    return Promise.resolve([[], []]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/pro/appointments — M1 à M9", () => {
  it("M1 — créneau disponible : 200, override_applied null", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 55, price: 80, depositPercentage: null, depositAmount: null, overrideApplied: null,
    });
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken()}`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 55, override_applied: null });

    const arg = mockCreateReservation.mock.calls[0][0];
    expect(arg).toMatchObject({ requestedByRole: "pro", bookingSource: "pro", proId: 7, clientId: 42 });
    expect(arg.manualOverride).toBeUndefined();
  });

  it("M3 — hors horaires sans override : 409 OUTSIDE_WORKING_HOURS + canOverride:true", async () => {
    const { ReservationServiceError } = await import("../services/reservation.service");
    mockCreateReservation.mockRejectedValueOnce(
      new ReservationServiceError(409, "Ce créneau est en dehors des horaires d'ouverture.", "OUTSIDE_WORKING_HOURS", {
        alternativeSlots: [],
        canOverride: true,
      })
    );
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken()}`).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "OUTSIDE_WORKING_HOURS", canOverride: true });
  });

  it("M2 — hors horaires avec override : 200, override_applied 'outside_hours', override transmis", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 56, price: 80, depositPercentage: null, depositAmount: null, overrideApplied: "outside_hours",
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ ...validBody, manual_override: { mode: "outside_hours" } });
    expect(res.status).toBe(200);
    expect(res.body.data.override_applied).toBe("outside_hours");
    expect(mockCreateReservation.mock.calls[0][0].manualOverride).toMatchObject({
      mode: "outside_hours",
      overrideByUserId: 7,
    });
  });

  it("M5 — override 'conflict' sans motif : 400 (Zod)", async () => {
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ ...validBody, manual_override: { mode: "conflict" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  it("M4 — override 'conflict' avec motif : 200, override_applied 'conflict'", async () => {
    mockCreateReservation.mockResolvedValueOnce({
      reservationId: 57, price: 80, depositPercentage: null, depositAmount: null, overrideApplied: "conflict",
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ ...validBody, manual_override: { mode: "conflict", note: "Cliente prévenue" } });
    expect(res.status).toBe(200);
    expect(res.body.data.override_applied).toBe("conflict");
  });

  it("M6 — mode d'override incohérent avec le vrai motif : 409 renvoyé tel quel", async () => {
    const { ReservationServiceError } = await import("../services/reservation.service");
    mockCreateReservation.mockRejectedValueOnce(
      new ReservationServiceError(409, "Ce créneau est en dehors des horaires d'ouverture.", "OUTSIDE_WORKING_HOURS", {})
    );
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ ...validBody, manual_override: { mode: "conflict", note: "motif" } });
    expect(res.status).toBe(409);
  });

  it("M8 — cliente hors périmètre (inconnue / autre pro / non liée) : 403 générique, service jamais appelé", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT role, is_admin, pro_status")) return Promise.resolve([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
      return Promise.resolve([[], []]); // aucune relation confirmed/completed
    });
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken()}`).send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Cliente non rattachée à votre compte.");
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  it("cliente bloquée : 403 (erreur service mappée)", async () => {
    const { ReservationServiceError } = await import("../services/reservation.service");
    mockCreateReservation.mockRejectedValueOnce(
      new ReservationServiceError(403, "Cette cliente est bloquée. Débloque-la avant de lui créer un rendez-vous.", "CLIENT_BLOCKED")
    );
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken()}`).send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CLIENT_BLOCKED");
  });

  it("un·e non-pro ne passe pas la gate /api/pro", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT role, is_admin, pro_status")) return Promise.resolve([[{ role: "client", is_admin: 0, pro_status: "inactive" }], []]);
      return Promise.resolve([[], []]);
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${jwt.sign({ id: 99, role: "client" }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" })}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});
