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
const { mockExecute, mockQuery, mockRefundCreate } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const mockRefundCreate = vi.fn();
  return { mockExecute, mockQuery, mockRefundCreate };
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
    refunds = { create: mockRefundCreate };
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

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/users/create — IBAN doit être chiffré, jamais en clair
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/users/create — chiffrement IBAN", () => {
  const adminToken = makeToken(1);
  const VALID_IBAN = "DE89370400440532013000";
  const basePayload = {
    first_name: "Test",
    last_name: "Pro",
    phone_number: "0612345678",
    email: "newpro@blyss.fr",
    role: "pro",
  };

  beforeEach(() => vi.clearAllMocks());

  it("chiffre l'IBAN et le nom du titulaire au lieu de les stocker en clair", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware
    mockQuery.mockResolvedValueOnce([[]]); // email check — pas de doublon
    mockQuery.mockResolvedValueOnce([{}]); // INSERT

    const res = await request(app)
      .post("/api/admin/users/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...basePayload, IBAN: VALID_IBAN, bankaccountname: "Test Pro" });

    expect(res.status).toBe(200);

    const insertCall = (mockQuery.mock.calls as unknown[][]).find(
      (a) => typeof a[0] === "string" && (a[0] as string).includes("INSERT INTO users")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];

    // Ni l'IBAN ni le nom du titulaire ne doivent apparaître en clair dans les
    // paramètres envoyés à la requête d'insertion.
    expect(params).not.toContain(VALID_IBAN);
    expect(params).not.toContain("Test Pro");
    // L'IBAN chiffré (ciphertext base64) doit être présent, non vide.
    const ibanParam = params.find((p) => typeof p === "string" && p.length > 0 && p !== "Test Pro");
    expect(typeof ibanParam).toBe("string");
  });

  it("400 si l'IBAN a un format invalide", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware
    mockQuery.mockResolvedValueOnce([[]]); // email check

    const res = await request(app)
      .post("/api/admin/users/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...basePayload, IBAN: "NOT_AN_IBAN", bankaccountname: "Test Pro" });

    expect(res.status).toBe(400);
  });

  it("400 si l'email est invalide (validation Zod, avant toute requête métier)", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware

    const res = await request(app)
      .post("/api/admin/users/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...basePayload, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validation Zod sur les autres routes d'écriture admin
// ═══════════════════════════════════════════════════════════════════════════
describe("Validation Zod — autres routes admin", () => {
  const adminToken = makeToken(1);
  beforeEach(() => vi.clearAllMocks());

  it("POST /notifications/create — 400 si user_id manquant", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .post("/api/admin/notifications/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "info", title: "Test", message: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /bookings/create — 400 si price est négatif", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .post("/api/admin/bookings/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        client_id: 1,
        pro_id: 2,
        prestation_id: 3,
        start_datetime: "2027-01-01T10:00:00.000Z",
        end_datetime: "2027-01-01T11:00:00.000Z",
        price: -10,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("PATCH /bookings/:id — 400 si status hors énumération", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .patch("/api/admin/bookings/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "not_a_real_status" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /coupons — 400 si discount_type invalide", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "PROMO10", discount_type: "invalid", discount_value: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /notifications/send — 400 si target hors énumération", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .post("/api/admin/notifications/send")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ target: "everyone", title: "Test", body: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /users/:id/grant-subscription — 400 si plan hors énumération", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);

    const res = await request(app)
      .post("/api/admin/users/1/grant-subscription")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ plan: "premium-deluxe", months: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/payments/:id/refund — doit vraiment appeler Stripe
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/payments/:id/refund", () => {
  const adminToken = makeToken(1);
  beforeEach(() => vi.clearAllMocks());

  it("appelle stripe.refunds.create et marque le paiement remboursé", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware
    mockQuery.mockResolvedValueOnce([
      [{ id: 42, reservation_id: 7, status: "succeeded", stripe_payment_intent_id: "pi_123", amount: "80.00" }],
      [],
    ]); // SELECT ... FOR UPDATE
    mockRefundCreate.mockResolvedValueOnce({ id: "re_123" });

    const res = await request(app)
      .post("/api/admin/payments/42/refund")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(mockRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_123" })
    );
    expect(res.status).toBe(200);
    expect(res.body.data.stripe_refund_id).toBe("re_123");

    const updateCall = (mockExecute.mock.calls as unknown[][]).find(
      (a) => typeof a[0] === "string" && (a[0] as string).includes("UPDATE payments") && (a[0] as string).includes("refunded")
    );
    expect(updateCall).toBeDefined();
  });

  it("404 si le paiement n'existe pas — n'appelle jamais Stripe", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    mockQuery.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post("/api/admin/payments/999/refund")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });

  it("400 si déjà remboursé — n'appelle jamais Stripe une deuxième fois", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    mockQuery.mockResolvedValueOnce([
      [{ id: 42, reservation_id: 7, status: "refunded", stripe_payment_intent_id: "pi_123", amount: "80.00" }],
      [],
    ]);

    const res = await request(app)
      .post("/api/admin/payments/42/refund")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Déjà remboursé");
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });

  it("400 si le paiement n'a pas de PaymentIntent Stripe (ex: payé sur place)", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    mockQuery.mockResolvedValueOnce([
      [{ id: 42, reservation_id: 7, status: "succeeded", stripe_payment_intent_id: null, amount: "80.00" }],
      [],
    ]);

    const res = await request(app)
      .post("/api/admin/payments/42/refund")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/users/:id — anonymise avant de supprimer (même mur FK
// que la suppression RGPD self-service), et 404 réel si l'utilisateur n'existe pas
// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE /api/admin/users/:id", () => {
  const adminToken = makeToken(1);
  beforeEach(() => vi.clearAllMocks());

  it("anonymise reservations/payments/reviews avant de supprimer l'utilisateur", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware
    mockQuery.mockResolvedValueOnce([[{ is_admin: 0 }]]); // SELECT is_admin FROM users WHERE id=?

    const res = await request(app)
      .delete("/api/admin/users/42")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const calls = (mockExecute.mock.calls as unknown[][]);
    expect(calls.some((a) => typeof a[0] === "string" && a[0].includes("UPDATE reservations") && a[0].includes("client_id = NULL"))).toBe(true);
    expect(calls.some((a) => typeof a[0] === "string" && a[0].includes("UPDATE payments") && a[0].includes("client_id = NULL"))).toBe(true);
    expect(calls.some((a) => typeof a[0] === "string" && a[0].includes("UPDATE reviews") && a[0].includes("client_id = NULL"))).toBe(true);
    expect(calls.some((a) => typeof a[0] === "string" && a[0].includes("UPDATE reviews") && a[0].includes("pro_id = NULL"))).toBe(true);
    expect(calls.some((a) => typeof a[0] === "string" && a[0].includes("DELETE FROM users"))).toBe(true);
  });

  it("404 réel si l'utilisateur n'existe pas (pas de faux succès)", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    mockQuery.mockResolvedValueOnce([[]]); // aucun utilisateur trouvé

    const res = await request(app)
      .delete("/api/admin/users/999")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/users/create — pro_status='active' crée un abonnement suivi
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/users/create — suivi de l'abonnement admin_grant", () => {
  const adminToken = makeToken(1);
  const basePayload = {
    first_name: "Test",
    last_name: "Pro",
    phone_number: "0612345678",
    email: "activepro@blyss.fr",
    role: "pro" as const,
  };

  beforeEach(() => vi.clearAllMocks());

  it("crée une ligne subscriptions admin_grant quand pro_status='active' est envoyé directement", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]); // requireAdminMiddleware
    mockQuery.mockResolvedValueOnce([[]]); // email check
    mockQuery.mockResolvedValueOnce([[{ id: 77 }], []]); // INSERT INTO users ... RETURNING id
    mockQuery.mockResolvedValueOnce([[], []]); // UPDATE subscriptions (cancel prior)
    mockQuery.mockResolvedValueOnce([[], []]); // INSERT INTO subscriptions

    const res = await request(app)
      .post("/api/admin/users/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...basePayload, pro_status: "active" });

    expect(res.status).toBe(200);

    const subCall = (mockQuery.mock.calls as unknown[][]).find(
      (a) => typeof a[0] === "string" && a[0].includes("INSERT INTO subscriptions") && a[0].includes("admin_grant")
    );
    expect(subCall).toBeDefined();
    expect(subCall?.[1]).toContain(77);
  });

  it("ne crée AUCUNE ligne subscriptions quand pro_status reste 'inactive'", async () => {
    mockQuery.mockResolvedValueOnce([[{ is_admin: 1 }]]);
    mockQuery.mockResolvedValueOnce([[]]); // email check
    mockQuery.mockResolvedValueOnce([[{ id: 78 }], []]); // INSERT INTO users ... RETURNING id

    const res = await request(app)
      .post("/api/admin/users/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(basePayload);

    expect(res.status).toBe(200);

    const subCall = (mockQuery.mock.calls as unknown[][]).find(
      (a) => typeof a[0] === "string" && a[0].includes("INSERT INTO subscriptions")
    );
    expect(subCall).toBeUndefined();
  });
});
