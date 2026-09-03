/**
 * Tests d'autorisation & non-divulgation — périmètre client de la pro.
 *
 *   GET  /api/pro/clients/search           — recherche par nom : clientes de la pro seulement
 *   GET  /api/pro/clients/search?exact=1   — walk-in : correspondance EXACTE email/téléphone
 *   POST /api/pro/appointments             — création bornée à la relation ou au contact exact
 *
 * On mocke la DB : le but est de prouver que (a) pro_id vient du token,
 * (b) la requête SQL est bien filtrée, (c) une cliente hors périmètre
 * renvoie la même réponse générique qu'une cliente inexistante.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({ query: mockQuery, execute: mockQuery, getConnection: vi.fn() }),
}));

vi.mock("../services/reservation.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/reservation.service")>();
  return { ...actual, createReservation: vi.fn().mockResolvedValue({ reservationId: 1, price: 50, overrideApplied: null }) };
});

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
const proToken = (id: number) => jwt.sign({ id, role: "pro" }, JWT_SECRET, { expiresIn: "15m" });

/** Gate requireProAccess : toujours un pro actif. */
const proGate = (sql: string) =>
  sql.includes("SELECT role, is_admin, pro_status")
    ? Promise.resolve([[{ role: "pro", is_admin: false, pro_status: "active" }], []])
    : null;

const FAR = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const apptBody = {
  client_id: 42,
  prestation_id: 10,
  start_datetime: FAR.toISOString(),
  end_datetime: new Date(FAR.getTime() + 3600 * 1000).toISOString(),
};

beforeEach(() => vi.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/pro/clients/search — recherche par nom (mode relation)", () => {
  it("filtre sur pro_id issu du token + statuts confirmed/completed", async () => {
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (sql.includes("FROM reservations r") && sql.includes("ILIKE")) {
        expect(sql).toContain("r.pro_id = ?");
        expect(sql).toContain("r.status IN ('confirmed','completed')");
        expect(params[0]).toBe(7); // pro_id du token, jamais du query
        return Promise.resolve([[{ id: 99, first_name: "Léa", last_name: "Bloch" }], []]);
      }
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .get("/api/pro/clients/search?q=Léa&pro_id=1")
      .set("Cookie", `access_token=${proToken(7)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 99, first_name: "Léa", last_name: "Bloch" }]);
  });

  it("pro B ne voit pas la cliente de pro A (résultat vide, aucun signal)", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      // La cliente existe mais pas de réservation avec CE pro → 0 ligne
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .get("/api/pro/clients/search?q=Martin")
      .set("Cookie", `access_token=${proToken(8)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/masqué|hidden|exists/i);
  });

  it("q trop court → pas de requête, liste vide", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app).get("/api/pro/clients/search?q=a").set("Cookie", `access_token=${proToken(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("FROM reservations r"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/pro/clients/search?exact=1 — walk-in", () => {
  it("email exact → résout même sans réservation antérieure", async () => {
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (sql.includes("LOWER(email) = ?")) {
        expect(params).toContain("alice@example.com");
        return Promise.resolve([[{ id: 500, first_name: "Alice", last_name: "M", email: "alice@example.com" }], []]);
      }
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .get("/api/pro/clients/search?exact=1&q=" + encodeURIComponent("Alice@Example.com"))
      .set("Cookie", `access_token=${proToken(7)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(500);
  });

  it("téléphone exact → compare sans séparateurs", async () => {
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (sql.toLowerCase().includes("regexp_replace")) {
        expect(params).toContain("0612345678");
        return Promise.resolve([[{ id: 501 }], []]);
      }
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .get("/api/pro/clients/search?exact=1&q=" + encodeURIComponent("06 12 34 56 78"))
      .set("Cookie", `access_token=${proToken(7)}`);

    expect(res.body.data).toEqual([{ id: 501 }]);
  });

  it("mode exact refuse un nom / fragment → aucune requête users, liste vide", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app)
      .get("/api/pro/clients/search?exact=1&q=Mart")
      .set("Cookie", `access_token=${proToken(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockQuery.mock.calls.some(([s]) => /LOWER\(email\)|regexp_replace/i.test(String(s)))).toBe(false);
  });

  it("mode exact ne fait jamais de ILIKE", async () => {
    mockQuery.mockImplementation((sql: string) => {
      expect(sql).not.toContain("ILIKE");
      return proGate(sql) ?? Promise.resolve([[], []]);
    });
    await request(app)
      .get("/api/pro/clients/search?exact=1&q=" + encodeURIComponent("bob@test.com"))
      .set("Cookie", `access_token=${proToken(7)}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/pro/appointments — création bornée", () => {
  const relationRow = (sql: string) =>
    sql.includes("FROM reservations") && sql.includes("status IN ('confirmed','completed')");

  it("relation confirmed existante → autorisé", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (relationRow(sql)) return Promise.resolve([[{ ok: 1 }], []]);
      return Promise.resolve([[], []]);
    });
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken(7)}`).send(apptBody);
    expect(res.status).toBe(200);
  });

  it("cliente d'une autre pro, sans contact → 403 générique", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken(7)}`).send(apptBody);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Cliente non rattachée à votre compte.");
  });

  it("client_id inexistant → 403 identique (non-divulgation)", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_id: 999999 });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Cliente non rattachée à votre compte.");
  });

  it("contact exact concordant → autorisé (walk-in)", async () => {
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (relationRow(sql)) return Promise.resolve([[], []]);
      if (sql.includes("LOWER(email) = ?")) {
        expect(params).toContain(42); // vérifie que le contact correspond à CE client_id
        expect(params).toContain("walkin@ex.com");
        return Promise.resolve([[{ ok: 1 }], []]);
      }
      return Promise.resolve([[], []]);
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_contact: "walkin@ex.com" });
    expect(res.status).toBe(200);
  });

  it("contact exact NON concordant avec le client_id → 403", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      return Promise.resolve([[], []]); // ni relation ni contact ne matchent
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_contact: "someone-else@ex.com" });
    expect(res.status).toBe(403);
  });

  it("contact = fragment de nom → ignoré, 403", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_contact: "Mart" });
    expect(res.status).toBe(403);
    // aucun lookup contact déclenché
    expect(mockQuery.mock.calls.some(([s]) => /LOWER\(email\)|regexp_replace/i.test(String(s)))).toBe(false);
  });
});
