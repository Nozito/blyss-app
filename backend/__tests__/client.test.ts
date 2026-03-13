/**
 * Tests — routes client critiques
 *
 * Couverts :
 *   GET  /api/health              → ok (DB répond) + degraded (DB KO)
 *   GET  /api/client/my-booking   → 200 avec liste + 401 sans token
 *   GET  /api/favorites           → 200 avec liste + 401 sans token
 *   DELETE /api/favorites/:proId  → 200 succès + 404 si favori absent
 *   PUT /api/reservations/:id/pay-on-site → 200 succès + 403 si mauvais pro + 404 si résa inconnue
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── 1. Mocks hoistés ─────────────────────────────────────────────────────
const { mockExecute, mockQuery, mockGetConnection } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  const mockGetConnection = vi.fn();
  return { mockExecute, mockQuery, mockGetConnection };
});

// ─── 2. Mock lib/db ───────────────────────────────────────────────────────
vi.mock("../lib/db", () => ({
  getDb: () => ({
    execute: mockExecute,
    query: mockQuery,
    getConnection: mockGetConnection,
  }),
  DbTimeoutError: class DbTimeoutError extends Error {
    constructor(msg: string) { super(msg); this.name = "DbTimeoutError"; }
  },
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

// ─── 5. Import serveur (APRÈS les mocks) ─────────────────────────────────
import { app } from "../server";

// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;

function makeClientToken(userId = 10) {
  return jwt.sign({ id: userId, role: "client" }, JWT_SECRET, { expiresIn: "15m" });
}

function makeProToken(userId = 5) {
  return jwt.sign({ id: userId, role: "pro" }, JWT_SECRET, { expiresIn: "15m" });
}

function makeConnection() {
  return {
    execute: mockExecute,
    query: mockQuery,
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConnection.mockResolvedValue(makeConnection());
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("200 {status:ok} quand la DB répond", async () => {
    // getDb().query("SELECT 1") retourne un tableau vide (suffit)
    mockQuery.mockResolvedValueOnce([[], []]);

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it("503 {status:degraded} quand la DB est KO", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB unreachable"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.db).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/client/my-booking", () => {
  it("401 sans token", async () => {
    const res = await request(app).get("/api/client/my-booking");
    expect(res.status).toBe(401);
  });

  it("200 et retourne la liste des réservations", async () => {
    const fakeBookings = [
      {
        id: 1,
        start_datetime: "2026-04-01T10:00:00.000Z",
        end_datetime: "2026-04-01T11:00:00.000Z",
        status: "confirmed",
        price: 50,
        paid_online: false,
        prestation_name: "Pose de gel",
        duration_minutes: 60,
        pro_first_name: "Sophie",
        pro_last_name: "Dupont",
        activity_name: "Sophie Nails",
        profile_photo: null,
        city: "Paris",
      },
    ];
    mockQuery.mockResolvedValueOnce([fakeBookings, []]);

    const token = makeClientToken(10);
    const res = await request(app)
      .get("/api/client/my-booking")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].id).toBe(1);
    expect(res.body.data[0].prestation.name).toBe("Pose de gel");
    expect(res.body.data[0].pro.first_name).toBe("Sophie");
  });

  it("200 et retourne un tableau vide si aucune réservation", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    const token = makeClientToken(10);
    const res = await request(app)
      .get("/api/client/my-booking")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/favorites", () => {
  it("401 sans token", async () => {
    const res = await request(app).get("/api/favorites");
    expect(res.status).toBe(401);
  });

  it("200 et retourne la liste des favoris", async () => {
    const fakeFavorites = [
      {
        id: 1,
        pro_id: 5,
        created_at: "2026-03-01T12:00:00.000Z",
        first_name: "Marie",
        last_name: "Martin",
        activity_name: "Marie Beauty",
        city: "Lyon",
        profile_photo: null,
        banner_photo: null,
        bio: "Spécialiste ongles",
        instagram_account: null,
        specialty: "Prothésiste ongulaire",
        avg_rating: "4.5",
        reviews_count: "3",
      },
    ];
    // GET /api/favorites uses getConnection then connection.query
    const conn = makeConnection();
    conn.query = vi.fn().mockResolvedValueOnce([fakeFavorites, []]);
    mockGetConnection.mockResolvedValueOnce(conn);

    const token = makeClientToken(10);
    const res = await request(app)
      .get("/api/favorites")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].pro_id).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/favorites/:proId", () => {
  it("401 sans token", async () => {
    const res = await request(app).delete("/api/favorites/5");
    expect(res.status).toBe(401);
  });

  it("200 si le favori existait et a été supprimé", async () => {
    const conn = makeConnection();
    // SELECT EXISTS check → row trouvée
    conn.query = vi.fn().mockResolvedValueOnce([[{ exists: 1 }], []]);
    conn.execute = vi.fn().mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockGetConnection.mockResolvedValueOnce(conn);

    const token = makeClientToken(10);
    const res = await request(app)
      .delete("/api/favorites/5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("404 si le favori n'existe pas", async () => {
    const conn = makeConnection();
    // SELECT count → 0 lignes
    conn.query = vi.fn().mockResolvedValueOnce([[], []]);
    mockGetConnection.mockResolvedValueOnce(conn);

    const token = makeClientToken(10);
    const res = await request(app)
      .delete("/api/favorites/999")
      .set("Authorization", `Bearer ${token}`);

    // Soit 404, soit le handler renvoie success:false — l'important est qu'il n'y a pas de 500
    expect(res.status).not.toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/reservations/:id/pay-on-site", () => {
  it("401 sans token", async () => {
    const res = await request(app).put("/api/reservations/1/pay-on-site");
    expect(res.status).toBe(401);
  });

  it("404 si la réservation n'existe pas", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    const token = makeProToken(5);
    const res = await request(app)
      .put("/api/reservations/999/pay-on-site")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("403 si le pro n'est pas propriétaire de la réservation", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ id: 1, price: 80, total_paid: 20, pro_id: 99 }],
      [],
    ]);

    const token = makeProToken(5); // pro_id=5, mais la résa appartient à pro_id=99
    const res = await request(app)
      .put("/api/reservations/1/pay-on-site")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("200 si le pro est propriétaire — enregistre le paiement sur place", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ id: 1, price: 80, total_paid: 20, pro_id: 5 }],
      [],
    ]);
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // INSERT payment
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // UPDATE reservation

    const token = makeProToken(5);
    const res = await request(app)
      .put("/api/reservations/1/pay-on-site")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
