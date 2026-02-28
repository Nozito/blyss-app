/**
 * Tests — Zod validation layer
 *
 * Couverts :
 *   POST /api/reviews          → rating hors plage, pro_id manquant, commentaire trop long,
 *                                 cas valide (mock DB), structure d'erreur {error:"validation_error"}
 *   PATCH /api/pro/prestations/:id → price négatif, duration_minutes trop grande,
 *                                    cas valide (mock DB)
 *   PUT /api/users/update      → first_name trop long, newPassword trop court
 *   PUT /api/pro/finance/objective → objective négatif, objective > 1 000 000
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
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

// ─── 3. Mock Stripe ───────────────────────────────────────────────────────
vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: () => ({ type: "test", data: { object: {} } }) };
    paymentIntents = { create: async () => ({}), retrieve: async () => ({}) };
    accounts = { retrieve: async () => ({}) };
    accountLinks = { create: async () => ({}) };
  }
  return { default: MockStripe };
});

// ─── 4. Mock InstagramService ─────────────────────────────────────────────
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

// ─── 5. Import serveur ────────────────────────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId = 42, role = "client") {
  return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

// Vérifie que la structure d'erreur Zod est cohérente
function expectValidationError(body: any, field?: string) {
  expect(body.error).toBe("validation_error");
  expect(Array.isArray(body.details)).toBe(true);
  if (field) {
    expect(body.details.some((d: { field: string }) => d.field === field)).toBe(true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/reviews — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/reviews — validation Zod", () => {
  const token = makeToken(42, "client");
  beforeEach(() => vi.clearAllMocks());

  it("400 si pro_id absent", async () => {
    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 4 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "pro_id");
  });

  it("400 si rating est 0 (inférieur à 1)", async () => {
    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 1, rating: 0 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "rating");
  });

  it("400 si rating est 6 (supérieur à 5)", async () => {
    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 1, rating: 6 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "rating");
  });

  it("400 si rating est un float (4.5)", async () => {
    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 1, rating: 4.5 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "rating");
  });

  it("400 si comment dépasse 1000 caractères", async () => {
    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 1, rating: 5, comment: "x".repeat(1001) });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "comment");
  });

  it("200 avec des données valides (mock DB)", async () => {
    // getConnection → query (check duplicate) → query (insert)
    mockQuery.mockResolvedValueOnce([[]]); // pas d'avis existant
    mockQuery.mockResolvedValueOnce([{}]); // INSERT OK

    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 1, rating: 5, comment: "Parfait !" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/pro/prestations/:id — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/pro/prestations/:id — validation Zod", () => {
  const token = makeToken(1, "pro");
  beforeEach(() => vi.clearAllMocks());

  it("400 si price est négatif", async () => {
    const res = await request(app)
      .patch("/api/pro/prestations/10")
      .set("Authorization", `Bearer ${token}`)
      .send({ price: -50 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "price");
  });

  it("400 si duration_minutes dépasse 480 (8h)", async () => {
    const res = await request(app)
      .patch("/api/pro/prestations/10")
      .set("Authorization", `Bearer ${token}`)
      .send({ duration_minutes: 600 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "duration_minutes");
  });

  it("400 si name est vide", async () => {
    const res = await request(app)
      .patch("/api/pro/prestations/10")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "name");
  });

  it("200 avec mise à jour partielle valide (mock DB)", async () => {
    // ownership check → trouvé
    mockQuery.mockResolvedValueOnce([[{ id: 10 }]]);
    // UPDATE
    mockQuery.mockResolvedValueOnce([{}]);
    // SELECT updated row
    mockQuery.mockResolvedValueOnce([[{ id: 10, name: "Nouveau nom", price: 60 }]]);

    const res = await request(app)
      .patch("/api/pro/prestations/10")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nouveau nom", price: 60 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/users/update — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/users/update — validation Zod", () => {
  const token = makeToken(42, "pro");
  beforeEach(() => vi.clearAllMocks());

  it("400 si first_name dépasse 50 caractères", async () => {
    const res = await request(app)
      .put("/api/users/update")
      .set("Authorization", `Bearer ${token}`)
      .send({ first_name: "A".repeat(51) });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "first_name");
  });

  it("400 si newPassword est trop court (< 8 caractères)", async () => {
    const res = await request(app)
      .put("/api/users/update")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "Abc1" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "newPassword");
  });

  it("400 si newPassword n'a pas de majuscule", async () => {
    const res = await request(app)
      .put("/api/users/update")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "password123" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "newPassword");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/pro/finance/objective — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/pro/finance/objective — validation Zod", () => {
  const token = makeToken(1, "pro");
  beforeEach(() => vi.clearAllMocks());

  it("400 si objective est négatif", async () => {
    const res = await request(app)
      .put("/api/pro/finance/objective")
      .set("Authorization", `Bearer ${token}`)
      .send({ objective: -100 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "objective");
  });

  it("400 si objective dépasse 1 000 000", async () => {
    const res = await request(app)
      .put("/api/pro/finance/objective")
      .set("Authorization", `Bearer ${token}`)
      .send({ objective: 1_000_001 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "objective");
  });

  it("400 si objective est absent", async () => {
    const res = await request(app)
      .put("/api/pro/finance/objective")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectValidationError(res.body, "objective");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/pro/stripe/deposit — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/pro/stripe/deposit — validation Zod", () => {
  const token = makeToken(1, "pro");
  beforeEach(() => vi.clearAllMocks());

  it("400 si deposit_percentage est absent", async () => {
    const res = await request(app)
      .put("/api/pro/stripe/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectValidationError(res.body, "deposit_percentage");
  });

  it("400 si deposit_percentage est une valeur non autorisée (25)", async () => {
    const res = await request(app)
      .put("/api/pro/stripe/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ deposit_percentage: 25 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "deposit_percentage");
  });

  it("400 si deposit_percentage est négatif", async () => {
    const res = await request(app)
      .put("/api/pro/stripe/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ deposit_percentage: -10 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "deposit_percentage");
  });

  it("200 avec deposit_percentage = 30 (mock DB)", async () => {
    mockExecute.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .put("/api/pro/stripe/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ deposit_percentage: 30 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deposit_percentage).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/payments/create-intent — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/payments/create-intent — validation Zod", () => {
  const token = makeToken(42, "client");
  beforeEach(() => vi.clearAllMocks());

  it("400 si reservation_id est absent", async () => {
    const res = await request(app)
      .post("/api/payments/create-intent")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "full" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "reservation_id");
  });

  it("400 si type est invalide", async () => {
    const res = await request(app)
      .post("/api/payments/create-intent")
      .set("Authorization", `Bearer ${token}`)
      .send({ reservation_id: 1, type: "invalid" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "type");
  });

  it("400 si reservation_id est un float", async () => {
    const res = await request(app)
      .post("/api/payments/create-intent")
      .set("Authorization", `Bearer ${token}`)
      .send({ reservation_id: 1.5, type: "full" });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "reservation_id");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/favorites — Zod validation
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/favorites — validation Zod", () => {
  const token = makeToken(42, "client");
  beforeEach(() => vi.clearAllMocks());

  it("400 si pro_id est absent", async () => {
    const res = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectValidationError(res.body, "pro_id");
  });

  it("400 si pro_id est négatif", async () => {
    const res = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: -5 });

    expect(res.status).toBe(400);
    expectValidationError(res.body, "pro_id");
  });

  it("200 avec pro_id valide (mock DB)", async () => {
    // SELECT existing favorite → none
    mockQuery.mockResolvedValueOnce([[]]); // no existing
    // INSERT
    mockQuery.mockResolvedValueOnce([{ insertId: 99 }]);

    const res = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ pro_id: 7 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
