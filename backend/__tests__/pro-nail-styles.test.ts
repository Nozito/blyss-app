/**
 * Tests — #34 PR 3 : /api/pro/nail-styles (spécialités nails de la pro).
 * DB mockée. Le gate /api/pro (authMiddleware + requireProAccess) fait
 * d'abord un SELECT role/is_admin/pro_status.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockExecute, mockQuery, cx } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
  cx: {
    execute: vi.fn(),
    query: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  },
}));
// cx.execute/query délèguent à mockExecute pour des assertions unifiées
cx.execute = mockExecute;
cx.query = mockExecute;
vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockQuery, getConnection: vi.fn().mockResolvedValue(cx) }),
}));
vi.mock("stripe", () => {
  class M { webhooks = { constructEvent: () => ({ type: "t", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) }; accountLinks = { create: async () => ({}) }; }
  return { default: M };
});

import { app } from "../server";

const JWT_SECRET = process.env.JWT_SECRET!;
const tok = (id: number) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });
const asPro = () => mockQuery.mockResolvedValueOnce([[{ role: "pro", is_admin: false, pro_status: "active" }]]);

beforeEach(() => {
  vi.clearAllMocks();
  cx.beginTransaction.mockResolvedValue(undefined);
  cx.commit.mockResolvedValue(undefined);
  cx.rollback.mockResolvedValue(undefined);
});

describe("GET /api/pro/nail-styles", () => {
  it("renvoie la liste des styles de la pro", async () => {
    asPro();
    mockQuery.mockResolvedValueOnce([[{ style_nails: "nail_art" }, { style_nails: "french_nude" }]]);
    const res = await request(app).get("/api/pro/nail-styles").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.styles).toEqual(["nail_art", "french_nude"]);
  });

  it("401 sans token", async () => {
    expect((await request(app).get("/api/pro/nail-styles")).status).toBe(401);
  });
});

describe("PUT /api/pro/nail-styles", () => {
  it("remplace tous les styles (DELETE + INSERT en transaction) et renvoie la liste triée", async () => {
    asPro();
    mockExecute.mockResolvedValue([[]]);
    mockQuery.mockResolvedValue([[]]);
    const res = await request(app)
      .put("/api/pro/nail-styles")
      .set("Authorization", `Bearer ${tok(1)}`)
      .send({ styles: ["vernis_gel", "nail_art", "vernis_gel"] });
    expect(res.status).toBe(200);
    expect(res.body.data.styles).toEqual(["nail_art", "vernis_gel"]);
    expect(cx.beginTransaction).toHaveBeenCalledTimes(1);
    expect(cx.commit).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls.some((c) => String(c[0]).startsWith("DELETE FROM pro_nail_styles"))).toBe(true);
    const inserts = mockExecute.mock.calls.filter((c) => String(c[0]).startsWith("INSERT INTO pro_nail_styles"));
    expect(inserts).toHaveLength(2);
  });

  it("style inconnu → 400 (Zod), aucune écriture", async () => {
    asPro();
    const res = await request(app)
      .put("/api/pro/nail-styles")
      .set("Authorization", `Bearer ${tok(1)}`)
      .send({ styles: ["chrome"] });
    expect(res.status).toBe(400);
    expect(cx.beginTransaction).not.toHaveBeenCalled();
  });

  it("rollback si un INSERT échoue", async () => {
    asPro();
    mockExecute.mockImplementation(async (sql: string) => {
      if (String(sql).startsWith("INSERT INTO pro_nail_styles")) throw new Error("db down");
      return [[]];
    });
    const res = await request(app)
      .put("/api/pro/nail-styles")
      .set("Authorization", `Bearer ${tok(1)}`)
      .send({ styles: ["nail_art"] });
    expect(res.status).toBe(500);
    expect(cx.rollback).toHaveBeenCalledTimes(1);
    expect(cx.commit).not.toHaveBeenCalled();
  });
});

describe("POST /api/pro/nail-styles", () => {
  it("ajoute un style (ON CONFLICT DO NOTHING) et renvoie la liste", async () => {
    asPro();
    mockExecute.mockResolvedValue([[]]);
    mockQuery.mockResolvedValueOnce([[{ style_nails: "nail_art" }]]);
    const res = await request(app)
      .post("/api/pro/nail-styles")
      .set("Authorization", `Bearer ${tok(1)}`)
      .send({ style: "nail_art" });
    expect(res.status).toBe(200);
    expect(res.body.data.styles).toEqual(["nail_art"]);
    expect(mockExecute.mock.calls[0][0]).toContain("ON CONFLICT DO NOTHING");
  });
});

describe("DELETE /api/pro/nail-styles/:style", () => {
  it("retire le style et renvoie la liste", async () => {
    asPro();
    mockExecute.mockResolvedValue([[]]);
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app).delete("/api/pro/nail-styles/pose_resine").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(200);
    expect(mockExecute.mock.calls[0][1]).toEqual([1, "pose_resine"]);
  });

  it("style invalide dans l'URL → 400", async () => {
    asPro();
    const res = await request(app).delete("/api/pro/nail-styles/chrome").set("Authorization", `Bearer ${tok(1)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_style");
  });
});
