/**
 * Tests — POST /api/auth/forgot-password + /api/auth/reset-password
 *
 * Couverts :
 *   forgot-password → validation Zod (email manquant, format invalide)
 *   forgot-password → user inconnu → 200 générique (anti-énumération)
 *   forgot-password → user trouvé  → génère token, envoie email, 200
 *   reset-password  → validation Zod (token manquant, mdp trop court, sans majuscule)
 *   reset-password  → token inconnu         → 400 invalid_token
 *   reset-password  → token expiré          → 400 token_expired
 *   reset-password  → token déjà utilisé    → 400 token_already_used
 *   reset-password  → token valide          → 200, password mis à jour
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  return { mockExecute };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => {
  class DbTimeoutError extends Error {}
  return {
    DbTimeoutError,
    getDb: () => ({
      execute: mockExecute,
      query: vi.fn(),
      getConnection: vi.fn().mockResolvedValue({
        execute: mockExecute,
        query: vi.fn(),
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        release: vi.fn(),
      }),
    }),
  };
});

// ─── 3. Mock lib/email ────────────────────────────────────────────────────
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
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

// ─── 6. Import serveur (APRÈS les mocks) ─────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockSendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  });

  it("400 — email manquant", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 — email format invalide", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "pas-un-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("200 générique — user inconnu (anti-énumération)", async () => {
    // DB retourne aucun utilisateur
    mockExecute.mockResolvedValueOnce([[]]); // SELECT users
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "inconnu@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("200 — user trouvé → token inséré + email envoyé", async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 42, first_name: "Alice", is_active: true }]]) // SELECT user
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // DELETE old tokens
      .mockResolvedValueOnce([{ insertId: 1 }]);    // INSERT new token

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "alice@blyss.fr" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      "alice@blyss.fr",
      "Alice",
      expect.any(String) // raw token (base64url)
    );
  });

  it("200 générique — user désactivé (anti-énumération)", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 5, first_name: "Bob", is_active: false }]]);
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "bob@blyss.fr" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("400 — token manquant", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ password: "ValidPass1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 — mdp trop court", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sometoken", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 — mdp sans majuscule/chiffre", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sometoken", password: "alllowercase" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("400 — token inconnu", async () => {
    mockExecute.mockResolvedValueOnce([[]]); // SELECT → aucun token
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "invalidtoken123", password: "ValidPass1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_token");
  });

  it("400 — token expiré", async () => {
    const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    mockExecute.mockResolvedValueOnce([[{
      id: 1,
      user_id: 42,
      expires_at: expiredDate.toISOString(),
      used_at: null,
    }]]);
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "expiredtoken", password: "ValidPass1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("token_expired");
  });

  it("400 — token déjà utilisé", async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    mockExecute.mockResolvedValueOnce([[{
      id: 1,
      user_id: 42,
      expires_at: futureDate.toISOString(),
      used_at: new Date().toISOString(), // already used
    }]]);
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "usedtoken", password: "ValidPass1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("token_already_used");
  });

  it("200 — token valide → mot de passe mis à jour", async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    mockExecute
      .mockResolvedValueOnce([[{  // SELECT token
        id: 1,
        user_id: 42,
        expires_at: futureDate.toISOString(),
        used_at: null,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users password
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE token used_at
      .mockResolvedValueOnce([{ affectedRows: 2 }]); // DELETE refresh_tokens

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "validtoken123", password: "ValidPass1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Vérifie que les refresh tokens ont été révoqués (4 appels DB)
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });
});
