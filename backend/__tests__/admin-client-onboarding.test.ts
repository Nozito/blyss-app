/**
 * Tests — #34 : GET/POST /api/admin/client-onboarding/:client_id
 * (inspection + rejeu de l'onboarding d'un client par un admin).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockExecute, mockQuery } = vi.hoisted(() => ({ mockExecute: vi.fn(), mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  getDb: () => ({
    execute: mockExecute, query: mockQuery,
    getConnection: vi.fn().mockResolvedValue({
      execute: mockExecute, query: mockQuery,
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }),
  }),
}));
vi.mock("stripe", () => {
  class M { webhooks = { constructEvent: () => ({ type: "t", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) }; accountLinks = { create: async () => ({}) }; refunds = { create: async () => ({}) }; }
  return { default: M };
});
vi.mock("../lib/audit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
const tok = (id: number) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });
const asAdmin = () => mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]); // requireAdminMiddleware

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/client-onboarding/:client_id", () => {
  it("401 sans token", async () => {
    expect((await request(app).get("/api/admin/client-onboarding/7")).status).toBe(401);
  });

  it("403 pour un non-admin", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: false }]]);
    const res = await request(app).get("/api/admin/client-onboarding/7").set("Authorization", `Bearer ${tok(9)}`);
    expect(res.status).toBe(403);
  });

  it("404 si le client n'existe pas", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[]]); // user lookup
    const res = await request(app).get("/api/admin/client-onboarding/999").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("client_not_found");
  });

  it("400 si l'utilisateur n'est pas un client", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[{ id: 3, role: "pro", first_name: "P", last_name: "R", email: "p@x" }]]);
    const res = await request(app).get("/api/admin/client-onboarding/3").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("not_a_client");
  });

  it("client sans onboarding → status not_started, valeurs par défaut", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[{ id: 7, role: "client", first_name: "Léa", last_name: "M", email: "lea@x" }]]);
    mockQuery.mockResolvedValueOnce([[]]); // client_onboarding
    mockQuery.mockResolvedValueOnce([[]]); // client_preferences
    mockQuery.mockResolvedValueOnce([[{ first_at: null, first_appt_at: null }]]);

    const res = await request(app).get("/api/admin/client-onboarding/7").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      client_id: 7, client_name: "Léa M", onboarding_step: 0, status: "not_started",
      onboarding_completed_at: null, onboarding_skipped: false,
      preferences: null, location: null, recommendations_viewed: 0, cta_tapped: 0,
      first_appointment_booked_at: null,
    });
  });

  it("onboarding complet → toutes les données", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[{ id: 7, role: "client", first_name: "Léa", last_name: "M", email: "lea@x" }]]);
    mockQuery.mockResolvedValueOnce([[{
      current_step: 5, started_at: "2026-09-06T09:00:00Z", completed_at: "2026-09-06T09:12:00Z",
      skipped_at: null, recommendations_viewed: 3, cta_tapped: 1,
      nudge_d1_sent: "2026-09-07T09:00:00Z", nudge_d3_sent: null, nudge_d7_sent: null,
    }]]);
    mockQuery.mockResolvedValueOnce([[{ style_nails: "nail_art", city: "Lyon", updated_at: "2026-09-06T09:03:00Z" }]]);
    mockQuery.mockResolvedValueOnce([[{ first_at: "2026-09-06T09:15:00Z", first_appt_at: "2026-09-10T14:00:00Z" }]]);

    const res = await request(app).get("/api/admin/client-onboarding/7").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      onboarding_step: 5, status: "completed",
      onboarding_completed_at: "2026-09-06T09:12:00Z",
      preferences: { style_nails: "nail_art" },
      location: "Lyon",
      recommendations_viewed: 3, cta_tapped: 1,
      first_appointment_booked_at: "2026-09-10T14:00:00Z",
    });
    expect(res.body.data.nudges_sent.d1).toBe("2026-09-07T09:00:00Z");
  });

  it("onboarding skippé → status skipped", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[{ id: 7, role: "client", first_name: "L", last_name: "M", email: "l@x" }]]);
    mockQuery.mockResolvedValueOnce([[{ current_step: 1, started_at: "x", completed_at: null, skipped_at: "2026-09-06T09:05:00Z", recommendations_viewed: 0, cta_tapped: 0 }]]);
    mockQuery.mockResolvedValueOnce([[]]);
    mockQuery.mockResolvedValueOnce([[{ first_at: null, first_appt_at: null }]]);
    const res = await request(app).get("/api/admin/client-onboarding/7").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.body.data.status).toBe("skipped");
    expect(res.body.data.onboarding_skipped).toBe(true);
  });
});

describe("POST /api/admin/client-onboarding/:client_id/replay", () => {
  it("admin → 200, reset current_step/completed_at/skipped_at + audit", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[{ role: "client" }]]);
    mockExecute.mockResolvedValue([[]]);
    const res = await request(app).post("/api/admin/client-onboarding/7/replay").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(200);
    const sql = String(mockExecute.mock.calls[0][0]);
    expect(sql).toContain("current_step = 0");
    expect(sql).toContain("completed_at = NULL");
    expect(sql).toContain("skipped_at = NULL");
  });

  it("non-admin → 403", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: false }]]);
    expect((await request(app).post("/api/admin/client-onboarding/7/replay").set("Authorization", `Bearer ${tok(9)}`)).status).toBe(403);
  });

  it("client inexistant → 404", async () => {
    asAdmin();
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app).post("/api/admin/client-onboarding/999/replay").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(404);
  });
});
