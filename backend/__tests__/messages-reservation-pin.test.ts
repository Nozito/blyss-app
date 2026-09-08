/**
 * PR 2 — la bannière "Voir le rendez-vous" (mobile) a besoin du statut ET de
 * la date de début du RDV épinglé pour décider si elle s'affiche. On vérifie
 * ici que le backend expose bien `reservation_start` / `reservationStart`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({ query: mockQuery, execute: mockQuery, getConnection: vi.fn() }),
}));

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
const clientToken = (id = 10) => jwt.sign({ id, role: "client" }, JWT_SECRET, { expiresIn: "15m" });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/messages/threads/:id — données de la bannière RDV", () => {
  it("expose reservationStart + reservationStatus du RDV épinglé", async () => {
    const START = "2026-10-01T09:00:00.000Z";
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT role FROM users")) return Promise.resolve([[{ role: "client" }], []]);
      if (sql.includes("FROM message_threads t")) {
        expect(sql).toContain("r.start_datetime AS reservation_start");
        return Promise.resolve([
          [{
            id: 3, client_id: 10, pro_id: 20, is_locked: false,
            client_first_name: "Léa", client_last_name: "B", client_photo: null,
            pro_name: "Studio", pro_photo: null,
            reservation_status: "confirmed", reservation_start: START,
            last_reservation_id: 99,
          }],
          [],
        ]);
      }
      if (sql.includes("FROM messages WHERE thread_id")) return Promise.resolve([[], []]);
      return Promise.resolve([[], []]); // UPDATE ... read_at / unread_count
    });

    const res = await request(app)
      .get("/api/messages/threads/3")
      .set("Cookie", `access_token=${clientToken(10)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reservationStatus).toBe("confirmed");
    expect(res.body.data.reservationStart).toBe(START);
  });

  it("reservationStart null quand aucun RDV n'est épinglé", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT role FROM users")) return Promise.resolve([[{ role: "client" }], []]);
      if (sql.includes("FROM message_threads t")) {
        return Promise.resolve([
          [{
            id: 4, client_id: 10, pro_id: 20, is_locked: false,
            client_first_name: "Léa", client_last_name: "B", client_photo: null,
            pro_name: "Studio", pro_photo: null,
            reservation_status: null, reservation_start: null, last_reservation_id: null,
          }],
          [],
        ]);
      }
      if (sql.includes("FROM messages WHERE thread_id")) return Promise.resolve([[], []]);
      return Promise.resolve([[], []]);
    });

    const res = await request(app)
      .get("/api/messages/threads/4")
      .set("Cookie", `access_token=${clientToken(10)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reservationStart).toBeNull();
    expect(res.body.data.reservationStatus).toBeNull();
  });
});
