/**
 * Smoke tests — Admin routes RBAC
 *
 * Couverts :
 *   GET /api/admin/users → 401 sans token, 403 non-admin, 200 admin
 *   POST /api/admin/notifications/create → 401, 403
 *
 * Principe : vérifie que la protection RBAC fonctionne,
 * sans tester la logique métier admin (couvert par des tests d'intégration).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ──────────────────────────────────────────────────────
const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

// ─── 2. Mock lib/db ────────────────────────────────────────────────────────
vi.mock("../lib/db", () => ({
  getDb: () => ({
    execute: mockExecute,
    query: mockQuery,
    getConnection: vi.fn().mockResolvedValue({
      execute: mockExecute,
      query: mockQuery,
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }),
  }),
}));

// ─── 3. Mock Stripe — doit être une classe (new Stripe() dans server.ts) ──
vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

// ─── 4. Mock InstagramService ──────────────────────────────────────────────
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

// ─── 5. Import du serveur (APRÈS les mocks) ───────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId: number) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "15m" });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/users
// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/users — RBAC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 sans Authorization header", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("401 avec un token invalide", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", "Bearer fake.token.here");
    expect(res.status).toBe(401);
  });

  it("403 avec un token valide mais utilisateur non-admin", async () => {
    const token = makeToken(99);
    // La route fait db.query("SELECT is_admin FROM users WHERE id = ?")
    mockQuery.mockResolvedValueOnce([[{ is_admin: 0 }]]);

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false });
  });

  it("403 si l'utilisateur n'existe pas en DB (is_admin check)", async () => {
    const token = makeToken(999);
    mockQuery.mockResolvedValueOnce([[]]); // aucun utilisateur en DB

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("200 avec un token admin valide", async () => {
    const token = makeToken(1);
    // Première query : is_admin check
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    // Deuxième query : COUNT(*) pour la pagination
    mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);
    // Troisième query : SELECT users list (avec LIMIT/OFFSET)
    mockQuery.mockResolvedValueOnce([[
      { id: 2, first_name: "Bob", email: "bob@blyss.fr", role: "pro" },
    ]]);

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/notifications/create
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/notifications/create — RBAC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 sans token", async () => {
    const res = await request(app)
      .post("/api/admin/notifications/create")
      .send({ userId: 1, type: "info", title: "Test", message: "Test" });
    expect(res.status).toBe(401);
  });

  it("403 avec un non-admin", async () => {
    const token = makeToken(99);
    mockQuery.mockResolvedValueOnce([[{ is_admin: 0 }]]);

    const res = await request(app)
      .post("/api/admin/notifications/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: 1, type: "info", title: "Test", message: "Test" });

    expect(res.status).toBe(403);
  });
});
