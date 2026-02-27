/**
 * Smoke tests — Auth routes
 *
 * Couverts :
 *   POST /api/auth/login   → missing fields, unknown email, wrong password,
 *                            anti-énumération (même erreur dans les deux cas)
 *   POST /api/auth/refresh → absent, invalide, révoqué, expiré
 *   authenticateToken      → sans token, token malformé, mauvais secret,
 *                            token valide accepté
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés — doivent être accessibles dans vi.mock() ───────────
const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

// ─── 2. Mock lib/db — intercepte getDb() AVANT l'import serveur ───────────
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

// ─── 4. Mock InstagramService (import mid-file dans server.ts) ────────────
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

function makeAccessToken(userId: number) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "15m" });
}

// Faux utilisateur retourné par le mock DB
const fakeUser = {
  id: 1,
  email: "pro@blyss.fr",
  // hash bcrypt de "WrongPass!" — valeur fictive, compare retournera false
  // sauf si on fournit le bon mdp, mais ici on ne teste pas le succès du login
  // (trop lent en test avec cost=12)
  password_hash: "$2b$12$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  first_name: "Alice",
  last_name: "Pro",
  role: "pro",
  is_admin: 0,
  is_verified: 1,
  pro_status: "active",
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si email ou password absent", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: "missing_fields" });
  });

  it("401 si l'email n'existe pas en DB", async () => {
    mockExecute.mockResolvedValueOnce([[]]); // aucun user trouvé

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@blyss.fr", password: "Test1234!" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("401 si le mot de passe est incorrect", async () => {
    mockExecute.mockResolvedValueOnce([[fakeUser]]); // user trouvé mais hash ne matche pas

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: fakeUser.email, password: "WrongPassword9!" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("anti-énumération : même code d'erreur pour email inconnu et mauvais mdp", async () => {
    // Cas 1 — email inconnu
    mockExecute.mockResolvedValueOnce([[]]); // user not found
    const res1 = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@blyss.fr", password: "Test1234!" });

    // Cas 2 — email connu, mauvais mot de passe
    mockExecute.mockResolvedValueOnce([[fakeUser]]); // user found, wrong password
    const res2 = await request(app)
      .post("/api/auth/login")
      .send({ email: fakeUser.email, password: "WrongPass1!" });

    expect(res1.status).toBe(res2.status);
    expect(res1.body.error).toBe(res2.body.error);
    expect(res1.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si refreshToken absent du body", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});

    expect(res.status).toBe(400);
  });

  it("401 si le token n'existe pas en DB", async () => {
    mockExecute.mockResolvedValueOnce([[]]); // aucun enregistrement

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "fake-token-not-in-db" });

    expect(res.status).toBe(401);
  });

  it("401 si le token est révoqué", async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    mockExecute.mockResolvedValueOnce([[
      { user_id: 1, expires_at: futureDate, revoked: 1 },
    ]]);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "revoked-token" });

    expect(res.status).toBe(401);
  });

  it("401 si le token est expiré", async () => {
    const pastDate = new Date(Date.now() - 60_000); // expiré il y a 1 min
    mockExecute.mockResolvedValueOnce([[
      { user_id: 1, expires_at: pastDate, revoked: 0 },
    ]]);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "expired-token" });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Middleware authenticateToken
// ═══════════════════════════════════════════════════════════════════════════
describe("authenticateToken middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 sur endpoint protégé sans Authorization header", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });

  it("401 avec un token malformé (pas un JWT)", async () => {
    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", "Bearer this-is-not-a-jwt");

    expect(res.status).toBe(401);
  });

  it("401 avec un token signé avec un mauvais secret", async () => {
    const fakeToken = jwt.sign({ id: 42 }, "wrong-secret-entirely", {
      expiresIn: "15m",
    });

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
  });

  it("ne renvoie pas 401 avec un token valide (passe le middleware)", async () => {
    const token = makeAccessToken(1);

    // Mock DB pour GET /api/auth/profile
    mockExecute.mockResolvedValueOnce([[{ ...fakeUser }]]);

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    // Le middleware laisse passer → code ≠ 401
    expect(res.status).not.toBe(401);
  });
});
