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

// ─── 5. Import du serveur (APRÈS les mocks) ───────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeAccessToken(userId: number) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "15m", issuer: "blyss-api", audience: "blyss-app" });
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
// POST /api/auth/signup — unicité email / téléphone
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/signup — doublons", () => {
  beforeEach(() => vi.clearAllMocks());

  const body = (over: Record<string, unknown> = {}) => ({
    first_name: "Léa",
    last_name: "Test",
    email: "lea@blyss.fr",
    password: "Abcd1234!",
    phone_number: "0612345678",
    birth_date: "2000-01-01",
    role: "client",
    ...over,
  });

  it("409 phone_exists quand seul le téléphone existe déjà", async () => {
    mockQuery.mockResolvedValueOnce([[{ email: "autre@blyss.fr", phone_number: "0612345678" }]]);
    const res = await request(app).post("/api/auth/signup").send(body());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("phone_exists");
  });

  it("409 email_exists quand l'email existe déjà", async () => {
    mockQuery.mockResolvedValueOnce([[{ email: "lea@blyss.fr", phone_number: null }]]);
    const res = await request(app).post("/api/auth/signup").send(body({ phone_number: "0699999999" }));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("email_exists");
  });

  it("email prioritaire si email ET téléphone collisionnent", async () => {
    mockQuery.mockResolvedValueOnce([[{ email: "lea@blyss.fr", phone_number: "0612345678" }]]);
    const res = await request(app).post("/api/auth/signup").send(body());
    expect(res.body.error).toBe("email_exists");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/check-availability
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/check-availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si ni email ni téléphone", async () => {
    const res = await request(app).post("/api/auth/check-availability").send({});
    expect(res.status).toBe(400);
  });

  it("email_taken=true quand l'email existe, requête normalisée en minuscules", async () => {
    mockQuery.mockResolvedValueOnce([[{ "?column?": 1 }]]);
    const res = await request(app).post("/api/auth/check-availability").send({ email: "  LEA@Blyss.FR " });
    expect(res.body.data).toEqual({ email_taken: true });
    expect(mockQuery.mock.calls[0][1]).toEqual(["lea@blyss.fr"]);
  });

  it("phone_taken=false quand le numéro est libre", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app).post("/api/auth/check-availability").send({ phone_number: "06 12 34 56 78" });
    expect(res.body.data).toEqual({ phone_taken: false });
    expect(mockQuery.mock.calls[0][1]).toEqual(["0612345678"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 si refreshToken absent du body et pas de cookie", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});

    expect(res.status).toBe(401);
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

  // Régression #22 : issuer / audience obligatoires.
  it("401 avec un token sans issuer/audience (émis hors contexte)", async () => {
    const noIssAud = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: "15m" });
    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${noIssAud}`);
    expect(res.status).toBe(401);
  });

  it("401 avec un token dont l'issuer / audience ne correspond pas", async () => {
    const wrongIssAud = jwt.sign({ id: 1 }, JWT_SECRET, {
      expiresIn: "15m",
      issuer: "someone-else",
      audience: "another-app",
    });
    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${wrongIssAud}`);
    expect(res.status).toBe(401);
  });
});
