/**
 * Tests unitaires — availability.service.ts
 *
 * Couvre : génération des plages libres, règle additive des buffers, lead-time,
 * horizon, rétrocompatibilité (pas de working_hours), passage à l'heure d'été /
 * d'hiver (Europe/Paris).
 *
 * lib/db est mocké : chaque requête est routée par un fragment de SQL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../lib/db", () => ({
  DbTimeoutError: class DbTimeoutError extends Error {},
  getDb: () => ({ query: mockQuery, execute: mockQuery, getConnection: vi.fn() }),
}));

import {
  getAvailability,
  checkSlotAvailability,
  resolveServiceBlocking,
  validateWorkingHoursPayload,
} from "../services/availability.service";

// ── Fixtures routables par SQL ─────────────────────────────────────────────

interface Fixture {
  pro?: any;
  services?: any[];
  workingHours?: any[];
  unavailabilities?: any[];
  reservations?: any[];
  /** false ⇒ la pro est filtrée par le garde-fou public (désactivée / privée). */
  proPublicVisible?: boolean;
  /** Slots précréés (adaptateur legacy, chantier 4). Colonnes : start, "end". */
  slots?: { start: string; end: string }[];
}

function installFixture(f: Fixture) {
  const pro = {
    id: 1,
    timezone: "Europe/Paris",
    default_booking_lead_time_minutes: null,
    default_booking_horizon_days: null,
    uses_availability_engine: true, // par défaut migrée ; un test peut passer pro:{...,uses_availability_engine:false}
    ...(f.pro ?? {}),
  };
  const services = f.services ?? [
    {
      id: 10,
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      booking_lead_time_minutes: null,
      booking_horizon_days: null,
      is_online_bookable: true,
    },
  ];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes("FROM users WHERE id")) {
      // Garde-fou public : la requête ajoute pro_status/is_active/visibility.
      const isPublicGated = sql.includes("pro_status = 'active'");
      if (isPublicGated && f.proPublicVisible === false) return Promise.resolve([[], []]);
      return Promise.resolve([[pro], []]);
    }
    if (sql.includes("FROM prestations")) return Promise.resolve([services, []]);
    if (sql.includes("FROM working_hours")) return Promise.resolve([f.workingHours ?? [], []]);
    if (sql.includes("FROM unavailabilities")) return Promise.resolve([f.unavailabilities ?? [], []]);
    if (sql.includes("FROM slots")) return Promise.resolve([f.slots ?? [], []]);
    if (sql.includes("FROM reservations")) return Promise.resolve([f.reservations ?? [], []]);
    return Promise.resolve([[], []]);
  });
}

const MON_9_18 = [{ weekday: 1, start_time: "09:00:00", end_time: "18:00:00" }];

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
describe("resolveServiceBlocking — règle additive", () => {
  it("prestation seule sans buffer", () => {
    const r = resolveServiceBlocking([
      { duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0 } as any,
    ]);
    expect(r).toMatchObject({ serviceDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, totalBlockedMinutes: 60 });
  });

  it("prestation avec buffers avant/après", () => {
    const r = resolveServiceBlocking([
      { duration_minutes: 60, buffer_before_minutes: 10, buffer_after_minutes: 15 } as any,
    ]);
    expect(r).toMatchObject({ serviceDurationMinutes: 60, bufferBeforeMinutes: 10, bufferAfterMinutes: 15, totalBlockedMinutes: 85 });
  });

  it("deux prestations : buffers internes cumulés dans la durée visible, pas de max()", () => {
    const r = resolveServiceBlocking([
      { duration_minutes: 60, buffer_before_minutes: 5, buffer_after_minutes: 10 } as any,
      { duration_minutes: 30, buffer_before_minutes: 5, buffer_after_minutes: 20 } as any,
    ]);
    // visible = 60 + 10 (after #1) + 5 (before #2) + 30 = 105
    // before = 5 (#1), after = 20 (#2), total = 130
    expect(r).toMatchObject({ serviceDurationMinutes: 105, bufferBeforeMinutes: 5, bufferAfterMinutes: 20, totalBlockedMinutes: 130 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("getAvailability — génération de créneaux", () => {
  it("génère des départs par pas de 15 min sur une plage 09:00–18:00", async () => {
    installFixture({ workingHours: MON_9_18 });
    // 2026-09-07 est un lundi
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    const day = res.days.find((d) => d.date === "2026-09-07")!;
    // 09:00 → dernier départ 17:00 (RDV 60 min finit 18:00) = 33 créneaux
    expect(day.slots.length).toBe(33);
    expect(day.slots[0].start).toBe("2026-09-07T07:00:00.000Z"); // 09:00 Paris = 07:00 UTC (CEST)
    expect(day.slots[day.slots.length - 1].start).toBe("2026-09-07T15:00:00.000Z"); // 17:00 Paris
  });

  it("retire la plage d'une réservation bloquante existante", async () => {
    installFixture({
      workingHours: MON_9_18,
      reservations: [
        {
          id: 99,
          blocked_start_datetime: "2026-09-07T10:00:00.000Z", // 12:00 Paris
          blocked_end_datetime: "2026-09-07T11:00:00.000Z", // 13:00 Paris
        },
      ],
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    const starts = res.days[0].slots.map((s) => s.start);
    // Aucun départ dont le RDV chevauche 12:00–13:00 Paris (10:00–11:00 UTC)
    expect(starts).not.toContain("2026-09-07T09:15:00.000Z"); // 11:15 Paris, finirait 12:15
    expect(starts).toContain("2026-09-07T09:00:00.000Z"); // 11:00 Paris, finit 12:00 → OK
    expect(starts).toContain("2026-09-07T11:00:00.000Z"); // 13:00 Paris → OK
  });

  it("gère une réservation bloquante dont les timestamps arrivent en Date (node-postgres) et pas en string", async () => {
    // Régression : DateTime.fromISO(Date) est invalide → l'intervalle bloquant
    // était silencieusement ignoré et le créneau restait affiché comme libre
    // (double-booking possible à l'affichage, cf. E2E).
    installFixture({
      workingHours: MON_9_18,
      reservations: [
        {
          id: 99,
          blocked_start_datetime: new Date("2026-09-07T10:00:00.000Z"),
          blocked_end_datetime: new Date("2026-09-07T11:00:00.000Z"),
        },
      ],
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    const starts = res.days[0].slots.map((s) => s.start);
    expect(starts).not.toContain("2026-09-07T09:15:00.000Z"); // 11:15 Paris → chevauche
    expect(starts).toContain("2026-09-07T09:00:00.000Z"); // 11:00 Paris → OK
  });

  it("exclut les départs sous le lead-time (public)", async () => {
    installFixture({
      workingHours: MON_9_18,
      pro: { id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: 2880, default_booking_horizon_days: null },
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-06T09:00:00.000Z"), // < 48h avant le 07 09:00
    });
    expect(res.days[0].slots.length).toBe(0);
  });

  it("la pro (ajout manuel) n'est pas bornée par le lead-time", async () => {
    installFixture({
      workingHours: MON_9_18,
      pro: { id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: 2880, default_booking_horizon_days: null },
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "pro",
      now: new Date("2026-09-06T09:00:00.000Z"),
    });
    expect(res.days[0].slots.length).toBeGreaterThan(0);
  });

  it("exclut les départs au-delà de l'horizon (public)", async () => {
    installFixture({
      workingHours: MON_9_18,
      pro: { id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: null, default_booking_horizon_days: 3 },
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-14",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    const total = res.days.reduce((n, d) => n + d.slots.length, 0);
    expect(total).toBe(0); // le 07 est à > 3 jours du 01
  });

  it("sans working_hours configurés : aucun créneau généré (mode legacy piloté par le mobile)", async () => {
    installFixture({ workingHours: [] });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-09-07",
      toDate: "2026-09-07",
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    expect(res.days[0].slots).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("getAvailability — pro NON migrée (adaptateur slots précréés, chantier 4)", () => {
  const input = {
    proId: 1,
    serviceIds: [10],
    fromDate: "2026-09-07",
    toDate: "2026-09-07",
    timezone: "Europe/Paris",
    requestedByRole: "public" as const,
    now: new Date("2026-09-01T08:00:00.000Z"),
  };

  it("expose les lignes `slots` telles quelles, sans calculer depuis working_hours", async () => {
    installFixture({
      pro: { uses_availability_engine: false },
      workingHours: MON_9_18, // ignoré en mode legacy
      slots: [
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T09:00:00Z" },
        { start: "2026-09-07T13:00:00Z", end: "2026-09-07T14:30:00Z" },
      ],
    });
    const res = await getAvailability(input);
    const starts = res.days[0].slots.map((s) => s.start);
    expect(starts).toEqual(["2026-09-07T08:00:00.000Z", "2026-09-07T13:00:00.000Z"]);
    expect(res.days[0].slots[1].end).toBe("2026-09-07T14:30:00.000Z"); // durée du slot, pas de la prestation
  });

  it("retire un slot qui chevauche une réservation bloquante", async () => {
    installFixture({
      pro: { uses_availability_engine: false },
      slots: [
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T09:00:00Z" },
        { start: "2026-09-07T10:00:00Z", end: "2026-09-07T11:00:00Z" },
      ],
      reservations: [
        { id: 9, blocked_start_datetime: "2026-09-07T10:30:00Z", blocked_end_datetime: "2026-09-07T11:30:00Z" },
      ],
    });
    const res = await getAvailability(input);
    expect(res.days[0].slots.map((s) => s.start)).toEqual(["2026-09-07T08:00:00.000Z"]);
  });

  it("AVAILABILITY_ENGINE_FORCE_OFF force l'adaptateur même si le flag pro est true", async () => {
    process.env.AVAILABILITY_ENGINE_FORCE_OFF = "true";
    try {
      installFixture({
        pro: { uses_availability_engine: true },
        workingHours: MON_9_18,
        slots: [{ start: "2026-09-07T08:00:00Z", end: "2026-09-07T09:00:00Z" }],
      });
      const res = await getAvailability(input);
      // 1 slot legacy, PAS les 33 créneaux calculés depuis 09:00-18:00
      expect(res.days[0].slots).toHaveLength(1);
    } finally {
      delete process.env.AVAILABILITY_ENGINE_FORCE_OFF;
    }
  });
});

describe("checkSlotAvailability — pro NON migrée : pas d'enforcement des horaires", () => {
  it("un créneau hors working_hours n'est PAS refusé outside_hours si la pro n'est pas migrée", async () => {
    installFixture({ pro: { uses_availability_engine: false }, workingHours: MON_9_18 });
    const r = await checkSlotAvailability({
      proId: 1,
      serviceIds: [10],
      timezone: "Europe/Paris",
      requestedByRole: "public",
      now: new Date("2026-09-01T08:00:00.000Z"),
      startDatetime: "2026-09-07T20:00:00.000Z", // 22:00 Paris, hors 09-18
    });
    expect(r.available).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("validateWorkingHoursPayload", () => {
  it("accepte des plages valides (plusieurs par jour, triées ou non)", () => {
    expect(() =>
      validateWorkingHoursPayload([
        { weekday: 1, ranges: [{ start_time: "13:30", end_time: "18:00" }, { start_time: "09:00", end_time: "12:30" }] },
        { weekday: 3, ranges: [] },
      ])
    ).not.toThrow();
  });

  it("rejette end_time <= start_time", () => {
    expect(() =>
      validateWorkingHoursPayload([{ weekday: 1, ranges: [{ start_time: "18:00", end_time: "09:00" }] }])
    ).toThrow(/finir après/);
  });

  it("rejette deux plages qui se chevauchent le même jour", () => {
    expect(() =>
      validateWorkingHoursPayload([
        { weekday: 2, ranges: [{ start_time: "09:00", end_time: "13:00" }, { start_time: "12:00", end_time: "18:00" }] },
      ])
    ).toThrow(/chevauchent/);
  });

  it("rejette un format d'heure invalide", () => {
    expect(() =>
      validateWorkingHoursPayload([{ weekday: 1, ranges: [{ start_time: "9h", end_time: "18:00" }] }])
    ).toThrow(/HH:MM/);
  });

  it("rejette un weekday hors 0-6 ou en double", () => {
    expect(() => validateWorkingHoursPayload([{ weekday: 7, ranges: [] }])).toThrow();
    expect(() =>
      validateWorkingHoursPayload([{ weekday: 1, ranges: [] }, { weekday: 1, ranges: [] }])
    ).toThrow(/double/);
  });

  it("rejette proprement (AvailabilityError 422) un start_time absent au lieu de planter le tri (L4)", () => {
    expect(() =>
      // @ts-expect-error — payload malformé volontaire
      validateWorkingHoursPayload([{ weekday: 1, ranges: [{ end_time: "18:00" }] }])
    ).toThrow(/HH:MM/);
    expect(() =>
      // @ts-expect-error — start_time non-string
      validateWorkingHoursPayload([{ weekday: 1, ranges: [{ start_time: 900, end_time: "18:00" }] }])
    ).toThrow(/HH:MM/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("getAvailability — confidentialité (garde-fou public)", () => {
  const input = {
    proId: 1,
    serviceIds: [10] as number[],
    fromDate: "2026-09-07",
    toDate: "2026-09-07",
    timezone: "Europe/Paris",
    now: new Date("2026-09-01T08:00:00.000Z"),
  };

  it("pro désactivée / profil privé → 404 pour le rôle public", async () => {
    installFixture({ workingHours: MON_9_18, proPublicVisible: false });
    await expect(
      getAvailability({ ...input, requestedByRole: "public" })
    ).rejects.toMatchObject({ status: 404, code: "PRO_NOT_FOUND" });
  });

  it("pro désactivée / profil privé → 200 pour le rôle pro (son propre planning)", async () => {
    installFixture({ workingHours: MON_9_18, proPublicVisible: false });
    const res = await getAvailability({ ...input, requestedByRole: "pro" });
    expect(res.days[0].slots.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("getAvailability — passage à l'heure d'été / d'hiver (Europe/Paris)", () => {
  it("passage à l'heure d'été : 29 mars 2026 (journée de 23 h) — aucun créneau dupliqué ni manquant sur l'heure sautée", async () => {
    // DST 2026 France : dimanche 29 mars, 02:00 local → 03:00 local.
    installFixture({
      workingHours: [{ weekday: 0, start_time: "00:00:00", end_time: "06:00:00" }],
      services: [
        { id: 10, duration_minutes: 15, buffer_before_minutes: 0, buffer_after_minutes: 0, booking_lead_time_minutes: null, booking_horizon_days: null, is_online_bookable: true },
      ],
    });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-03-29",
      toDate: "2026-03-29",
      timezone: "Europe/Paris",
      slotStepMinutes: 15,
      requestedByRole: "pro",
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    const startsMs = res.days[0].slots.map((s) => Date.parse(s.start));
    // Départs strictement croissants, espacés d'exactement 15 min réelles :
    // pas de doublon (heure d'hiver) ni de trou (heure d'été).
    for (let i = 1; i < startsMs.length; i++) {
      expect(startsMs[i] - startsMs[i - 1]).toBe(15 * 60 * 1000);
    }
    // Fenêtre 00:00→06:00 local = 5 h réelles ce jour (l'heure 02:00–03:00 est
    // sautée) → 20 départs de 15 min (le dernier à 05:45 local, RDV finit 06:00).
    expect(res.days[0].slots.length).toBe(20);
    expect(res.days[0].slots[0].start).toBe("2026-03-28T23:00:00.000Z"); // 00:00 local CET
    expect(res.days[0].slots[19].start).toBe("2026-03-29T03:45:00.000Z"); // 05:45 local CEST
  });

  it("heure d'hiver : 25 octobre 2026, journée de 25 h — 09:00–18:00 génère bien 9 h de créneaux", async () => {
    installFixture({ workingHours: [{ weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }] });
    const res = await getAvailability({
      proId: 1,
      serviceIds: [10],
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
      timezone: "Europe/Paris",
      requestedByRole: "pro",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    // 09:00→17:00 départs, pas de 60, RDV 60 min : 33 créneaux (comme un jour normal).
    expect(res.days[0].slots.length).toBe(33);
    // 09:00 Paris ce jour = 08:00 UTC (déjà repassé en CET)
    expect(res.days[0].slots[0].start).toBe("2026-10-25T08:00:00.000Z");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("checkSlotAvailability", () => {
  const baseInput = {
    proId: 1,
    serviceIds: [10],
    timezone: "Europe/Paris",
    requestedByRole: "public" as const,
    now: new Date("2026-09-01T08:00:00.000Z"),
  };

  it("disponible sur un créneau dans les horaires, sans conflit", async () => {
    installFixture({ workingHours: MON_9_18 });
    const r = await checkSlotAvailability({ ...baseInput, startDatetime: "2026-09-07T10:00:00.000Z" }); // 12:00 Paris
    expect(r.available).toBe(true);
    expect(r.blockedStart).toBe("2026-09-07T10:00:00.000Z");
    expect(r.blockedEnd).toBe("2026-09-07T11:00:00.000Z");
  });

  it("outside_hours si le créneau déborde des horaires d'ouverture", async () => {
    installFixture({ workingHours: MON_9_18 });
    const r = await checkSlotAvailability({ ...baseInput, startDatetime: "2026-09-07T16:30:00.000Z" }); // 18:30 Paris
    expect(r).toMatchObject({ available: false, reason: "outside_hours" });
  });

  it("overlaps_reservation si chevauchement d'une réservation bloquante", async () => {
    installFixture({
      workingHours: MON_9_18,
      reservations: [
        { id: 99, blocked_start_datetime: "2026-09-07T10:30:00.000Z", blocked_end_datetime: "2026-09-07T11:30:00.000Z" },
      ],
    });
    const r = await checkSlotAvailability({ ...baseInput, startDatetime: "2026-09-07T10:00:00.000Z" });
    expect(r).toMatchObject({ available: false, reason: "overlaps_reservation" });
  });

  it("excludeReservationId : ignore le RDV en cours de reprogrammation", async () => {
    installFixture({
      workingHours: MON_9_18,
      reservations: [], // la requête exclut déjà 99 via le WHERE id <> ?
    });
    const r = await checkSlotAvailability({
      ...baseInput,
      startDatetime: "2026-09-07T10:00:00.000Z",
      excludeReservationId: 99,
    });
    expect(r.available).toBe(true);
  });

  it("overlaps_unavailability si le créneau tombe sur une pause déclarée (même sans working_hours)", async () => {
    installFixture({
      workingHours: [],
      unavailabilities: [
        { start_date: "2026-09-07", end_date: "2026-09-07", start_time: "12:00:00", end_time: "13:00:00" },
      ],
    });
    const r = await checkSlotAvailability({
      ...baseInput,
      requestedByRole: "pro",
      startDatetime: "2026-09-07T10:30:00.000Z", // 12:30 Paris
    });
    expect(r).toMatchObject({ available: false, reason: "overlaps_unavailability" });
  });

  it("before_lead_time pour un départ trop proche (public)", async () => {
    installFixture({
      workingHours: MON_9_18,
      pro: { id: 1, timezone: "Europe/Paris", default_booking_lead_time_minutes: 2880, default_booking_horizon_days: null },
    });
    const r = await checkSlotAvailability({
      ...baseInput,
      now: new Date("2026-09-06T09:00:00.000Z"),
      startDatetime: "2026-09-07T08:00:00.000Z",
    });
    expect(r).toMatchObject({ available: false, reason: "before_lead_time" });
  });
});
