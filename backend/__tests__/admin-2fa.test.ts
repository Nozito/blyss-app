/**
 * Tests d'intégration — 2FA TOTP admin (issue #21)
 *
 * Couverts :
 *   Enrôlement : POST /api/admin/2fa/setup → /confirm → totp_enabled = TRUE
 *   Codes de secours : génération (8) + consommation via /api/auth/2fa/verify
 *   Claim amr:["mfa"] sur le token d'accès après /2fa/verify (+ propagation /refresh)
 *   ADMIN_2FA_REQUIRED : admin sans TOTP → 403, admin MFA → 200, token sans amr → 401,
 *                        routes d'enrôlement toujours accessibles
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockExecute, mockQuery } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
}));

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

// otplib réel trop coûteux / dépendant de l'horloge : on stubbe la seule
// vérification TOTP, en gardant le reste de lib/totp (chiffrement AES,
// backup codes bcrypt) réel.
const VALID_TOTP = "123456";
vi.mock("../lib/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/totp")>();
  return {
    ...actual,
    verifyTotpToken: vi.fn(async (_secret: string, token: string) => token === VALID_TOTP),
  };
});

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
    refunds = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

import { app } from "../server";
import { encryptTotpSecret, generateBackupCodes } from "../lib/totp";

const JWT_SECRET = process.env.JWT_SECRET!;
const signOpts = { expiresIn: "15m" as const, issuer: "blyss-api", audience: "blyss-app" };

function accessToken(id: number, amr?: string[]) {
  return jwt.sign(amr ? { id, amr } : { id }, JWT_SECRET, signOpts);
}
function challengeToken(id: number) {
  return jwt.sign({ id, purpose: "2fa_challenge" }, JWT_SECRET, { ...signOpts, expiresIn: "5m" });
}

const ENC = encryptTotpSecret("JBSWY3DPEHPK3PXP");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_2FA_REQUIRED;
});
afterEach(() => {
  delete process.env.ADMIN_2FA_REQUIRED;
});

// ═══════════════════════════════════════════════════════════════════════════
// Enrôlement
// ═══════════════════════════════════════════════════════════════════════════
describe("Enrôlement TOTP admin", () => {
  it("setup → confirm active totp_enabled et renvoie 8 codes de secours", async () => {
    // setup : requireAdmin (is_admin + totp_enabled), puis SELECT email/totp_enabled, puis UPDATE
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[{ email: "admin@blyss.fr", totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[]]); // UPDATE secret

    const setup = await request(app)
      .post("/api/admin/2fa/setup")
      .set("Authorization", `Bearer ${accessToken(1)}`);

    expect(setup.status).toBe(200);
    expect(setup.body.data.qr_code).toMatch(/^data:image\/png;base64,/);
    expect(typeof setup.body.data.secret).toBe("string");

    // confirm : requireAdmin, puis SELECT secret, puis UPDATE totp_enabled + backup, puis audit log
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[{ totp_secret_encrypted: ENC.ciphertext, totp_secret_iv: ENC.iv }]]);
    mockQuery.mockResolvedValue([[]]);

    const confirm = await request(app)
      .post("/api/admin/2fa/confirm")
      .set("Authorization", `Bearer ${accessToken(1)}`)
      .send({ token: VALID_TOTP });

    expect(confirm.status).toBe(200);
    expect(confirm.body.data.backup_codes).toHaveLength(8);

    const enableUpdate = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("totp_enabled = TRUE")
    );
    expect(enableUpdate).toBeTruthy();
  });

  it("confirm avec un code invalide → 400, totp_enabled inchangé", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[{ totp_secret_encrypted: ENC.ciphertext, totp_secret_iv: ENC.iv }]]);

    const res = await request(app)
      .post("/api/admin/2fa/confirm")
      .set("Authorization", `Bearer ${accessToken(1)}`)
      .send({ token: "000000" });

    expect(res.status).toBe(400);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("totp_enabled = TRUE"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /api/auth/2fa/verify — second facteur, amr, backup codes
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/2fa/verify", () => {
  it("code TOTP valide → tokens, accessToken porte amr:['mfa']", async () => {
    mockExecute.mockResolvedValueOnce([[
      { id: 1, is_admin: true, totp_enabled: true, totp_secret_encrypted: ENC.ciphertext, totp_secret_iv: ENC.iv },
    ]]);
    mockExecute.mockResolvedValue([[]]); // last_login_at + INSERT refresh

    const res = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ challenge_token: challengeToken(1), code: VALID_TOTP });

    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.accessToken) as { amr?: string[] };
    expect(decoded.amr).toEqual(["mfa"]);

    const insertRefresh = mockExecute.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO refresh_tokens")
    );
    expect(insertRefresh).toBeTruthy();
    expect(insertRefresh![1]).toContain(true); // param mfa = true
  });

  it("code de secours valide → 200 et le code est retiré de la liste", async () => {
    const { plain, hashed } = await generateBackupCodes();
    mockExecute.mockResolvedValueOnce([[
      {
        id: 1, is_admin: true, totp_enabled: true,
        totp_secret_encrypted: ENC.ciphertext, totp_secret_iv: ENC.iv,
        totp_backup_codes: hashed,
      },
    ]]);
    mockExecute.mockResolvedValue([[]]);

    const res = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ challenge_token: challengeToken(1), code: plain[0] });

    expect(res.status).toBe(200);
    const consume = mockExecute.mock.calls.find((c) =>
      String(c[0]).includes("totp_backup_codes = ?")
    );
    expect(consume).toBeTruthy();
    expect(JSON.parse(consume![1][0])).toHaveLength(hashed.length - 1);
  });

  it("code invalide → 401", async () => {
    mockExecute.mockResolvedValueOnce([[
      { id: 1, is_admin: true, totp_enabled: true, totp_secret_encrypted: ENC.ciphertext, totp_secret_iv: ENC.iv, totp_backup_codes: [] },
    ]]);
    const res = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ challenge_token: challengeToken(1), code: "999999" });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN_2FA_REQUIRED
// ═══════════════════════════════════════════════════════════════════════════
describe("ADMIN_2FA_REQUIRED = true", () => {
  beforeEach(() => {
    process.env.ADMIN_2FA_REQUIRED = "true";
  });

  it("admin sans TOTP → 403 2fa_enrollment_required sur /api/admin/*", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${accessToken(1)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("2fa_enrollment_required");
  });

  it("admin avec TOTP mais token sans amr → 401 mfa_required", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: true }]]);
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${accessToken(1)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("mfa_required");
  });

  it("admin avec TOTP et token amr:['mfa'] → 200", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: true }]]);
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]);
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${accessToken(1, ["mfa"])}`);
    expect(res.status).toBe(200);
  });

  it("route d'enrôlement /2fa/setup accessible à un admin sans TOTP", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[{ email: "admin@blyss.fr", totp_enabled: false }]]);
    mockQuery.mockResolvedValue([[]]);
    const res = await request(app)
      .post("/api/admin/2fa/setup")
      .set("Authorization", `Bearer ${accessToken(1)}`);
    expect(res.status).toBe(200);
  });

  it("non-admin → toujours 403 (accès réservé), pas de fuite 2FA", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: false, totp_enabled: false }]]);
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${accessToken(2)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBeUndefined();
  });
});

describe("ADMIN_2FA_REQUIRED absent (défaut)", () => {
  it("admin sans TOTP passe (comportement historique)", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: true, totp_enabled: false }]]);
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]);
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${accessToken(1)}`);
    expect(res.status).toBe(200);
  });
});
