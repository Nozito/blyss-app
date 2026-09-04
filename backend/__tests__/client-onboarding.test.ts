/**
 * Tests — #34 onboarding client nails.
 *   Routes /api/client/onboarding/{status,preferences,recommendations,complete}
 *   Cron  cron/onboarding-nudge (J+1/J+3/J+7)
 * DB mockée.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockExecute, mockQuery } = vi.hoisted(() => ({ mockExecute: vi.fn(), mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  getDb: () => ({
    execute: mockExecute,
    query: mockQuery,
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
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "t", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});
const { mockPush, mockExpo } = vi.hoisted(() => ({ mockPush: vi.fn(), mockExpo: vi.fn() }));
vi.mock("../lib/push", () => ({ sendPushToUser: mockPush, sendExpoPushToUsers: mockExpo }));

import { app } from "../server";
import { runOnboardingNudgeCycle } from "../cron/onboarding-nudge";

const JWT_SECRET = process.env.JWT_SECRET!;
const tok = (id: number) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });

beforeEach(() => vi.clearAllMocks());

// ═══════════════ /status ═══════════════
describe("GET /api/client/onboarding/status", () => {
  it("aucune ligne → step 0, non complété", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app).get("/api/client/onboarding/status").set("Authorization", `Bearer ${tok(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ current_step: 0, completed: false, style_nails: null });
  });

  it("ligne existante → renvoie step, complété, style", async () => {
    mockQuery.mockResolvedValueOnce([[{ current_step: 3, completed_at: "2026-09-06T10:00:00Z", style_nails: "french" }]]);
    const res = await request(app).get("/api/client/onboarding/status").set("Authorization", `Bearer ${tok(7)}`);
    expect(res.body.data).toMatchObject({ current_step: 3, completed: true, style_nails: "french" });
  });

  it("401 sans token", async () => {
    expect((await request(app).get("/api/client/onboarding/status")).status).toBe(401);
  });
});

// ═══════════════ /preferences ═══════════════
describe("POST /api/client/onboarding/preferences", () => {
  it("style valide → upsert préférence + progression, renvoie style", async () => {
    mockQuery.mockResolvedValueOnce([[{ role: "client" }]]); // assertClient
    mockExecute.mockResolvedValue([[]]);
    const res = await request(app)
      .post("/api/client/onboarding/preferences")
      .set("Authorization", `Bearer ${tok(7)}`)
      .send({ style_nails: "gel" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ style_nails: "gel" });
    expect(mockExecute.mock.calls.some((c) => String(c[0]).includes("INSERT INTO client_preferences"))).toBe(true);
    expect(mockExecute.mock.calls.some((c) => String(c[0]).includes("INSERT INTO client_onboarding"))).toBe(true);
  });

  it("style inconnu → 400", async () => {
    const res = await request(app)
      .post("/api/client/onboarding/preferences")
      .set("Authorization", `Bearer ${tok(7)}`)
      .send({ style_nails: "chrome" });
    expect(res.status).toBe(400);
  });

  it("utilisateur non-client → 403", async () => {
    mockQuery.mockResolvedValueOnce([[{ role: "pro" }]]);
    const res = await request(app)
      .post("/api/client/onboarding/preferences")
      .set("Authorization", `Bearer ${tok(9)}`)
      .send({ style_nails: "french" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("client_required");
  });
});

// ═══════════════ /recommendations ═══════════════
describe("GET /api/client/onboarding/recommendations", () => {
  it("renvoie ≤ 3 pros mappés + style écho", async () => {
    mockQuery.mockResolvedValueOnce([[{ style_nails: "french" }]]); // pref
    mockQuery.mockResolvedValueOnce([[
      { id: 2, name: "Camille Beauty", city: "Lyon", profile_photo: "p.jpg", banner_photo: null,
        rating: 4.8, reviews_count: 42, bookings_90d: 30, upcoming_14d: 9, has_hours: true, matches_style: false },
      { id: 3, name: "Emma Nail Art", city: "Lyon", profile_photo: null, banner_photo: null,
        rating: 4.5, reviews_count: 12, bookings_90d: 8, upcoming_14d: 2, has_hours: true, matches_style: false },
    ]]);
    const res = await request(app)
      .get("/api/client/onboarding/recommendations?city=Lyon")
      .set("Authorization", `Bearer ${tok(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.style_nails).toBe("french");
    expect(res.body.data.recommendations).toHaveLength(2);
    expect(res.body.data.recommendations[0]).toMatchObject({
      pro_id: 2, name: "Camille Beauty", rating: 4.8, reviews_count: 42,
      bookings_90d: 30, upcoming_14d: 9, has_availability: true, matches_style: false,
    });
  });

  it("aucun pro → liste vide", async () => {
    mockQuery.mockResolvedValueOnce([[]]);       // pref
    mockQuery.mockResolvedValueOnce([[]]);       // pros
    const res = await request(app).get("/api/client/onboarding/recommendations").set("Authorization", `Bearer ${tok(7)}`);
    expect(res.body.data.recommendations).toEqual([]);
    expect(res.body.data.style_matching_active).toBe(false);
  });
});

// ═══════════════ /complete ═══════════════
describe("POST /api/client/onboarding/complete", () => {
  it("client → 200 et fige completed_at", async () => {
    mockQuery.mockResolvedValueOnce([[{ role: "client" }]]);
    mockExecute.mockResolvedValue([[]]);
    const res = await request(app).post("/api/client/onboarding/complete").set("Authorization", `Bearer ${tok(7)}`);
    expect(res.status).toBe(200);
    expect(mockExecute.mock.calls.some((c) => String(c[0]).includes("completed_at"))).toBe(true);
  });

  it("non-client → 403", async () => {
    mockQuery.mockResolvedValueOnce([[{ role: "pro" }]]);
    expect((await request(app).post("/api/client/onboarding/complete").set("Authorization", `Bearer ${tok(9)}`)).status).toBe(403);
  });
});

// ═══════════════ cron onboarding-nudge ═══════════════
describe("cron/onboarding-nudge", () => {
  it("envoie un push + notif DB par client réclamé, pour chaque palier", async () => {
    // 3 appels claim (d1/d3/d7) — d1 réclame le client 7, d3/d7 rien
    mockQuery
      .mockResolvedValueOnce([[{ client_id: 7 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    mockExecute.mockResolvedValue([[]]);

    await runOnboardingNudgeCycle();

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockExpo).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toEqual(7);
    expect(mockExecute.mock.calls.some((c) => String(c[0]).includes("INSERT INTO notifications"))).toBe(true);
  });

  it("la requête de claim exclut les clients ayant déjà réservé et coche nudge_dN_sent", async () => {
    mockQuery.mockResolvedValue([[]]);
    await runOnboardingNudgeCycle();
    const claim = String(mockQuery.mock.calls[0][0]);
    expect(claim).toContain("NOT EXISTS (SELECT 1 FROM reservations");
    expect(claim).toContain("completed_at IS NULL");
    expect(claim).toMatch(/SET nudge_d1_sent = NOW\(\)/);
  });

  it("un envoi qui échoue n'interrompt pas le cycle", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ client_id: 7 }, { client_id: 8 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    mockExecute.mockResolvedValue([[]]);
    mockPush.mockRejectedValueOnce(new Error("expo down"));
    await runOnboardingNudgeCycle();
    expect(mockPush).toHaveBeenCalledTimes(2); // continue au 2ᵉ client
  });
});
