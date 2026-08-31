/**
 * Tests — reservation.service.ts (anti-double-booking 3.3 + overrides 3.4)
 *
 * DB mockée. On vérifie la SÉQUENCE (pré-check → BEGIN → lock (RESERVATION_LOCK_NS,
 * pro_id) → re-check sous verrou → INSERT → COMMIT), les rollbacks, et l'audit
 * des overrides (sans PII).
 *
 * La concurrence réelle (deux transactions Postgres en course) est couverte par
 * backend/loadtest/ ; ici on valide la logique applicative.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockExecute, conn } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockExecute = vi.fn();
  const conn = {
    query: mockQuery,
    execute: mockExecute,
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  return { mockQuery, mockExecute, conn };
});

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({ query: mockQuery, execute: mockExecute, getConnection: vi.fn().mockResolvedValue(conn) }),
}));

vi.mock("../lib/notifications", () => ({
  sendNotificationToUser: vi.fn().mockResolvedValue(true),
}));

import { createReservation, ReservationServiceError, SLOT_NO_LONGER_AVAILABLE } from "../services/reservation.service";
import { RESERVATION_LOCK_NS } from "../lib/locks";

const MON_9_18 = [{ weekday: 1, start_time: "09:00:00", end_time: "18:00:00" }];

/** Réservations « bloquantes » visibles au moteur de dispo + au re-check verrou. */
function installFixture(opts: {
  workingHours?: any[];
  availabilityReservations?: any[]; // vues par checkSlotAvailability (pré-check)
  lockRecheckReservations?: any[]; // vues par le re-check SOUS verrou
  conflictIds?: number[]; // pour l'audit override "conflict"
  insertId?: number;
}) {
  const insertId = opts.insertId ?? 55;
  mockExecute.mockResolvedValue([[{ id: insertId }], []]);
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes("pg_advisory_xact_lock")) return Promise.resolve([[], []]);
    if (sql.includes("FROM prestations")) {
      return Promise.resolve([
        [
          {
            id: 10,
            name: "Pose gel",
            price: 80,
            duration_minutes: 60,
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
            booking_lead_time_minutes: null,
            booking_horizon_days: null,
            is_online_bookable: true,
          },
        ],
        [],
      ]);
    }
    if (sql.includes("FROM users WHERE id")) {
      return Promise.resolve([
        [{ id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: null, default_booking_horizon_days: null, deposit_percentage: 30, stripe_onboarding_complete: true }],
        [],
      ]);
    }
    if (sql.includes("FROM working_hours")) return Promise.resolve([opts.workingHours ?? MON_9_18, []]);
    if (sql.includes("FROM blocked_clients")) return Promise.resolve([[], []]);
    if (sql.includes("FROM unavailabilities")) return Promise.resolve([[], []]);
    // Moteur de dispo (pré-check) : SELECT TO_CHAR(blocked_* AT TIME ZONE 'UTC') ...
    if (sql.includes("AT TIME ZONE 'UTC'")) {
      return Promise.resolve([opts.availabilityReservations ?? [], []]);
    }
    // Re-check SOUS verrou : "SELECT id FROM reservations ... blocked_start_datetime IS NOT NULL"
    if (sql.includes("FROM reservations") && sql.includes("blocked_start_datetime IS NOT NULL")) {
      return Promise.resolve([opts.lockRecheckReservations ?? [], []]);
    }
    // Capture des conflits pour l'audit (mode "conflict")
    if (sql.includes("FROM reservations")) {
      return Promise.resolve([(opts.conflictIds ?? []).map((id) => ({ id })), []]);
    }
    if (sql.includes("INSERT INTO notifications")) return Promise.resolve([[{ id: 900, created_at: new Date().toISOString() }], []]);
    return Promise.resolve([[], []]);
  });
}

const baseInput = {
  proId: 1,
  clientId: 42,
  serviceIds: [10],
  startDatetime: "2026-09-07T10:00:00.000Z", // lundi 12:00 Paris
  requestedByRole: "public" as const,
  bookingSource: "client" as const,
  now: new Date("2026-09-01T08:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  conn.beginTransaction.mockResolvedValue(undefined);
  conn.commit.mockResolvedValue(undefined);
  conn.rollback.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
describe("createReservation — séquence nominale", () => {
  it("prend le verrou (RESERVATION_LOCK_NS, pro_id) AVANT l'INSERT, puis commit", async () => {
    installFixture({});
    const res = await createReservation(baseInput);

    expect(res.reservationId).toBe(55);
    expect(res.overrideApplied).toBeNull();

    const lockCall = mockQuery.mock.calls.find((c) => String(c[0]).includes("pg_advisory_xact_lock"));
    expect(lockCall?.[1]).toEqual([RESERVATION_LOCK_NS, 1]);

    // Ordre : beginTransaction < lock < INSERT < commit
    expect(conn.beginTransaction).toHaveBeenCalled();
    const lockOrder = lockCall![0] === undefined ? -1 : mockQuery.mock.invocationCallOrder[mockQuery.mock.calls.indexOf(lockCall!)];
    const insertOrder = mockExecute.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(insertOrder);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it("écrit le snapshot (blocked_start/end, durée, buffers) dans l'INSERT", async () => {
    installFixture({});
    await createReservation(baseInput);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain("blocked_start_datetime");
    expect(params).toContain("2026-09-07T10:00:00.000Z"); // blocked_start
    expect(params).toContain("2026-09-07T11:00:00.000Z"); // blocked_end
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("createReservation — conflit", () => {
  it("409 SLOT_NO_LONGER_AVAILABLE si le pré-check voit déjà un chevauchement", async () => {
    installFixture({
      availabilityReservations: [
        { id: 99, blocked_start_datetime: "2026-09-07T10:30:00.000Z", blocked_end_datetime: "2026-09-07T11:30:00.000Z" },
      ],
    });
    await expect(createReservation(baseInput)).rejects.toMatchObject({
      status: 409,
      code: SLOT_NO_LONGER_AVAILABLE,
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("409 + ROLLBACK si le re-check SOUS VERROU détecte un conflit apparu après le pré-check", async () => {
    installFixture({
      availabilityReservations: [], // pré-check OK
      lockRecheckReservations: [{ id: 99 }], // conflit apparu entre-temps
    });
    await expect(createReservation(baseInput)).rejects.toMatchObject({ status: 409, code: SLOT_NO_LONGER_AVAILABLE });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("createReservation — overrides 3.4", () => {
  const proInput = {
    ...baseInput,
    requestedByRole: "pro" as const,
    bookingSource: "pro" as const,
  };

  it("403 si un override est fourni sur le flow public", async () => {
    installFixture({});
    await expect(
      createReservation({ ...baseInput, manualOverride: { mode: "conflict", note: "x", overrideByUserId: 1 } })
    ).rejects.toMatchObject({ status: 403, code: "OVERRIDE_NOT_ALLOWED" });
  });

  it("422 si override 'conflict' sans motif", async () => {
    installFixture({});
    await expect(
      createReservation({ ...proInput, manualOverride: { mode: "conflict", note: "  ", overrideByUserId: 1 } })
    ).rejects.toMatchObject({ status: 422, code: "OVERRIDE_REASON_REQUIRED" });
  });

  it("outside_hours sans override → 409 avec canOverride:true", async () => {
    installFixture({ workingHours: MON_9_18 });
    await expect(
      createReservation({ ...proInput, startDatetime: "2026-09-07T20:00:00.000Z" }) // 22:00 Paris
    ).rejects.toMatchObject({ status: 409, code: "OUTSIDE_WORKING_HOURS", extra: { canOverride: true } });
  });

  it("override A (outside_hours) → INSERT avec audit, n'élargit pas la dispo publique", async () => {
    installFixture({ workingHours: MON_9_18 });
    const res = await createReservation({
      ...proInput,
      startDatetime: "2026-09-07T20:00:00.000Z",
      manualOverride: { mode: "outside_hours", note: null, overrideByUserId: 1 },
    });
    expect(res.overrideApplied).toBe("outside_hours");
    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContain("outside_hours"); // manual_override_reason
    expect(params).toContain(1); // manual_override_by_user_id
  });

  it("override B (conflict) → audit conflicts SANS PII (reservation_ids uniquement)", async () => {
    installFixture({
      availabilityReservations: [
        { id: 77, blocked_start_datetime: "2026-09-07T10:30:00.000Z", blocked_end_datetime: "2026-09-07T11:30:00.000Z" },
      ],
      lockRecheckReservations: [{ id: 77 }],
      conflictIds: [77],
    });
    const res = await createReservation({
      ...proInput,
      manualOverride: { mode: "conflict", note: "Cliente prévenue, RDV maintenu", overrideByUserId: 1 },
    });
    expect(res.overrideApplied).toBe("conflict");
    const [, params] = mockExecute.mock.calls[0];
    const conflictsParam = params.find((p: unknown) => typeof p === "string" && p.includes("reservation_ids"));
    expect(conflictsParam).toBeDefined();
    const parsed = JSON.parse(conflictsParam);
    expect(parsed.reservation_ids).toEqual([77]);
    // Aucune clé de PII
    expect(Object.keys(parsed).sort()).toEqual(["captured_at", "reservation_ids"]);
  });

  it("override 'conflict' mais le vrai motif est outside_hours → 409, aucun INSERT", async () => {
    installFixture({ workingHours: MON_9_18 });
    await expect(
      createReservation({
        ...proInput,
        startDatetime: "2026-09-07T20:00:00.000Z",
        manualOverride: { mode: "conflict", note: "motif", overrideByUserId: 1 },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("override 'conflict' mais le re-check ne voit plus de conflit → INSERT normal, overrideApplied=null", async () => {
    installFixture({
      availabilityReservations: [
        { id: 77, blocked_start_datetime: "2026-09-07T10:30:00.000Z", blocked_end_datetime: "2026-09-07T11:30:00.000Z" },
      ],
      lockRecheckReservations: [], // le conflit a disparu (annulation concurrente)
    });
    const res = await createReservation({
      ...proInput,
      manualOverride: { mode: "conflict", note: "motif", overrideByUserId: 1 },
    });
    expect(res.overrideApplied).toBeNull();
    const [, params] = mockExecute.mock.calls[0];
    expect(params).not.toContain("conflict");
  });
});
