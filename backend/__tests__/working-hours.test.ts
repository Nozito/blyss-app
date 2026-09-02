/**
 * Tests — GET/PUT /api/pro/working-hours (chantier 4)
 *
 * DB mockée. Vérifie : mapping GET par jour, validation PUT (chevauchement /
 * end<=start → 422), bascule `uses_availability_engine` à la 1ʳᵉ sauvegarde,
 * pro_id pris du token.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockTopQuery, mockConn } = vi.hoisted(() => {
  const mockConn = {
    query: vi.fn(),
    execute: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  return { mockTopQuery: vi.fn(), mockConn };
});

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({
    query: mockTopQuery,
    execute: mockTopQuery,
    getConnection: vi.fn().mockResolvedValue(mockConn),
  }),
}));

vi.mock("../lib/notifications", () => ({
  connectedClients: new Map(),
  sendNotificationToUser: vi.fn().mockResolvedValue(true),
  sendUnreadNotifications: vi.fn(),
  broadcastNotification: vi.fn(),
}));

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
const proToken = (id = 7) => jwt.sign({ id, role: "pro" }, JWT_SECRET, { expiresIn: "15m" });

beforeEach(() => {
  vi.clearAllMocks();
  mockConn.query.mockResolvedValue([[], []]);
  // requireProAccess (gate /api/pro/*)
  mockTopQuery.mockResolvedValue([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]);
});

describe("GET /api/pro/working-hours", () => {
  it("regroupe les plages par jour et émet les 7 jours", async () => {
    mockTopQuery
      .mockResolvedValueOnce([[{ role: "pro", is_admin: 0, pro_status: "active" }], []]) // gate
      .mockResolvedValueOnce([
        [
          { id: 1, weekday: 1, start_time: "09:00", end_time: "12:30" },
          { id: 2, weekday: 1, start_time: "13:30", end_time: "18:00" },
          { id: 3, weekday: 4, start_time: "09:00", end_time: "17:00" },
        ],
        [],
      ]);

    const res = await request(app).get("/api/pro/working-hours").set("Cookie", `access_token=${proToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(7);
    const monday = res.body.data.days.find((d: any) => d.weekday === 1);
    expect(monday.ranges).toEqual([
      { start_time: "09:00", end_time: "12:30" },
      { start_time: "13:30", end_time: "18:00" },
    ]);
    expect(res.body.data.days.find((d: any) => d.weekday === 0).ranges).toEqual([]);
  });
});

describe("PUT /api/pro/working-hours", () => {
  const validDays = [
    { weekday: 1, ranges: [{ start_time: "09:00", end_time: "12:30" }, { start_time: "13:30", end_time: "18:00" }] },
    { weekday: 2, ranges: [{ start_time: "09:00", end_time: "18:00" }] },
  ];

  it("422 si deux plages du même jour se chevauchent — aucune transaction ouverte", async () => {
    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ days: [{ weekday: 1, ranges: [{ start_time: "09:00", end_time: "13:00" }, { start_time: "12:00", end_time: "18:00" }] }] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("OVERLAPPING_RANGES");
    expect(mockConn.beginTransaction).not.toHaveBeenCalled();
  });

  it("422 si end_time <= start_time", async () => {
    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ days: [{ weekday: 1, ranges: [{ start_time: "18:00", end_time: "09:00" }] }] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_RANGE");
  });

  it("200 + migrated:true à la 1ʳᵉ sauvegarde non vide (DELETE puis INSERT, flag basculé)", async () => {
    mockConn.query.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE users SET uses_availability_engine")) return Promise.resolve([[{ id: 7 }], []]);
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ days: validDays });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ migrated: true, reverted: false });

    const calls = mockConn.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("DELETE FROM working_hours"))).toBe(true);
    expect(calls.filter((s) => s.includes("INSERT INTO working_hours")).length).toBe(3); // 2 lundi + 1 mardi
    // pro_id de toutes les requêtes = 7 (token), jamais du body
    for (const c of mockConn.query.mock.calls) {
      if (Array.isArray(c[1]) && c[1].length) expect(c[1][0]).toBe(7);
    }
    expect(mockConn.commit).toHaveBeenCalled();
  });

  it("200 + migrated:false si la pro était déjà migrée (UPDATE ... WHERE uses_availability_engine = FALSE → 0 ligne)", async () => {
    mockConn.query.mockResolvedValue([[], []]); // UPDATE users → 0 ligne

    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ days: validDays });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ migrated: false, reverted: false });
  });

  // ── Revue sécurité M1 / issue #10 — pro migrée qui vide ses working_hours ──

  it("pro migrée + plages vidées → repasse en mode legacy (reverted:true), dans la transaction", async () => {
    mockConn.query.mockImplementation((sql: string) => {
      // UPDATE ... uses_availability_engine = FALSE WHERE ... = TRUE → 1 ligne
      if (sql.includes("uses_availability_engine = FALSE")) return Promise.resolve([[{ id: 7 }], []]);
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ days: [{ weekday: 1, ranges: [] }, { weekday: 2, ranges: [] }] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ migrated: false, reverted: true });

    const calls = mockConn.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("DELETE FROM working_hours"))).toBe(true);
    expect(calls.some((s) => /SET uses_availability_engine = FALSE/.test(s))).toBe(true);
    // jamais de bascule vers TRUE quand il n'y a aucune plage
    expect(calls.some((s) => /SET uses_availability_engine = TRUE/.test(s))).toBe(false);
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
  });

  it("pro legacy + plages vidées → aucun changement de flag (reverted:false)", async () => {
    // UPDATE ... WHERE uses_availability_engine = TRUE → 0 ligne (pro déjà legacy)
    mockConn.query.mockResolvedValue([[], []]);

    const res = await request(app)
      .put("/api/pro/working-hours")
      .set("Cookie", `access_token=${proToken()}`)
      .send({ days: [{ weekday: 1, ranges: [] }] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ migrated: false, reverted: false });
  });
});
