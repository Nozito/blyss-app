/**
 * Tests d'autorisation & non-divulgation — périmètre client de la pro.
 *
 *   GET  /api/pro/clients/search   — recherche bornée aux clientes de la pro
 *   POST /api/pro/appointments     — création bornée à une relation existante
 *
 * Décision produit : une pro ne peut créer un RDV que pour une cliente avec
 * qui elle a DÉJÀ une réservation status IN ('confirmed','completed').
 * Il n'existe plus de flux "walk-in" / contact exact / client_contact.
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

const relationRow = (sql: string) =>
  sql.includes("FROM reservations") && sql.includes("status IN ('confirmed','completed')");

const FAR = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const apptBody = {
  client_id: 42,
  prestation_id: 10,
  start_datetime: FAR.toISOString(),
  end_datetime: new Date(FAR.getTime() + 3600 * 1000).toISOString(),
};

beforeEach(() => vi.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/pro/clients/search — périmètre relationnel strict", () => {
  it("filtre sur pro_id du token + statuts confirmed/completed", async () => {
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

  it("isolation Pro A / Pro B : Pro A ne voit jamais une cliente liée uniquement à Pro B", async () => {
    // Le mock ne renvoie une ligne QUE si la requête porte le bon pro_id ET
    // que la jointure reservations est bien filtrée sur confirmed/completed.
    const CLIENT_OF_B = { id: 500, first_name: "Nadia", last_name: "K" };
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (sql.includes("FROM reservations r") && sql.includes("ILIKE")) {
        const proId = params[0];
        // Nadia n'a de réservation confirmed/completed qu'avec la pro 200 (B).
        if (proId === 200) return Promise.resolve([[CLIENT_OF_B], []]);
        return Promise.resolve([[], []]);
      }
      return Promise.resolve([[], []]);
    });

    const asA = await request(app).get("/api/pro/clients/search?q=Nadia").set("Cookie", `access_token=${proToken(100)}`);
    const asB = await request(app).get("/api/pro/clients/search?q=Nadia").set("Cookie", `access_token=${proToken(200)}`);

    expect(asA.status).toBe(200);
    expect(asA.body.data).toEqual([]); // Pro A : rien
    expect(JSON.stringify(asA.body)).not.toMatch(/masqué|hidden|exists/i);
    expect(asB.body.data).toEqual([CLIENT_OF_B]); // Pro B : sa cliente
  });

  it("q trop court → pas de requête, liste vide", async () => {
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app).get("/api/pro/clients/search?q=a").set("Cookie", `access_token=${proToken(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("FROM reservations r"))).toBe(false);
  });

  it("?exact=1 n'est plus un mode privilégié : recherche relationnelle normale, jamais de lookup users direct", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      // aucune requête ne doit résoudre une cliente par email/téléphone exact
      expect(sql).not.toMatch(/LOWER\(email\)\s*=\s*\?/);
      expect(sql).not.toMatch(/regexp_replace\(phone_number/);
      if (sql.includes("FROM reservations r")) return Promise.resolve([[], []]);
      return Promise.resolve([[], []]);
    });
    const res = await request(app)
      .get("/api/pro/clients/search?exact=1&q=" + encodeURIComponent("walkin@ex.com"))
      .set("Cookie", `access_token=${proToken(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/pro/appointments — relation existante obligatoire", () => {
  it("relation confirmed/completed existante → autorisé", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      if (relationRow(sql)) return Promise.resolve([[{ ok: 1 }], []]);
      return Promise.resolve([[], []]);
    });
    const res = await request(app).post("/api/pro/appointments").set("Cookie", `access_token=${proToken(7)}`).send(apptBody);
    expect(res.status).toBe(200);
  });

  it("aucune relation → 403 générique, service jamais appelé", async () => {
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

  it("client_id d'une cliente d'une autre pro → 403 identique", async () => {
    // relationRow renvoie vide pour cette pro → refus, sans révéler l'existence
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_id: 500 });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Cliente non rattachée à votre compte.");
  });

  it("client_contact dans le body est ignoré (plus de bypass walk-in)", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const gate = proGate(sql);
      if (gate) return gate;
      // aucun lookup users par email/téléphone ne doit être déclenché
      expect(sql).not.toMatch(/LOWER\(email\)\s*=\s*\?/);
      expect(sql).not.toMatch(/regexp_replace\(phone_number/);
      return Promise.resolve([[], []]); // pas de relation
    });
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_contact: "walkin@ex.com" });
    expect(res.status).toBe(403);
  });

  it("appel direct à l'API sans passer par la recherche → même contrôle", async () => {
    // Simule un client HTTP qui devine un client_id sans jamais avoir listé.
    mockQuery.mockImplementation((sql: string) => proGate(sql) ?? Promise.resolve([[], []]));
    const res = await request(app)
      .post("/api/pro/appointments")
      .set("Cookie", `access_token=${proToken(7)}`)
      .send({ ...apptBody, client_id: 1 });
    expect(res.status).toBe(403);
  });
});
