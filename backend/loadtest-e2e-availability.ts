#!/usr/bin/env node
/**
 * E2E — moteur de disponibilités / anti-double-booking / ajout manuel pro.
 *
 * Exécute le VRAI app Express contre la VRAIE base (pg direct via .env.dev —
 * pas de mock lib/db), donc pg_advisory_xact_lock() et le re-check sous verrou
 * sont réellement exercés. Chaque scénario assert à la fois la réponse HTTP ET
 * l'état en base (vérité terrain).
 *
 * Données de test isolées par email loadtest-e2e-avail-*@blyss-loadtest.invalid.
 * Cleanup garanti en try/finally (même sur échec).
 *
 * Usage (depuis la racine blyss-app) :
 *   node_modules/.bin/ts-node backend/loadtest-e2e-availability.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });
process.env.NODE_ENV = "test";
process.env.LOADTEST_BYPASS_RATE_LIMIT = "true";

import request from "supertest";
import bcrypt from "bcrypt";
import { DateTime } from "luxon";
import { app } from "./server";
import { getDb } from "./lib/db";

const db = getDb();
const TZ = "Europe/Paris";
const PASSWORD = "Loadtest123!";
const EMAIL_PREFIX = "loadtest-e2e-avail-";
const E = (s: string) => `${EMAIL_PREFIX}${s}@blyss-loadtest.invalid`;

// ── Petit framework d'assertion ────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

// ── Helpers date ──────────────────────────────────────────────────────────
/** Instant ISO pour `HH:mm` locale (Europe/Paris) le jour `dateIso`. */
function at(dateIso: string, hhmm: string): string {
  return DateTime.fromISO(`${dateIso}T${hhmm}`, { zone: TZ }).toUTC().toISO()!;
}
function plusMin(iso: string, min: number): string {
  return DateTime.fromISO(iso).plus({ minutes: min }).toUTC().toISO()!;
}

// Lundi ouvré à >= 21 jours (hors délai de rétractation 14 j → pas de consentement).
const BASE = (() => {
  let d = DateTime.now().setZone(TZ).plus({ days: 21 }).startOf("day");
  while (d.weekday !== 1) d = d.plus({ days: 1 });
  return d.toISODate()!;
})();

// Transitions DST à venir (après aujourd'hui) : dernier dimanche d'octobre 2026
// (recul, journée de 25 h) et dernier dimanche de mars 2027 (avance, 23 h).
const DST_FALL = "2026-10-25"; // 09:00 Paris = CET = 08:00Z
const DST_SPRING = "2027-03-28"; // 09:00 Paris = CEST = 07:00Z

// ── Seed ──────────────────────────────────────────────────────────────────
interface Seeded {
  proId: number;
  proInactiveId: number;
  proPrivateId: number;
  proLegacyId: number;
  client1Id: number;
  client2Id: number;
  prestationId: number;
  prestationPrivateId: number;
  prestationLegacyId: number;
  proToken: string;
  proPrivateToken: string;
  proLegacyToken: string;
  client1Token: string;
  client2Token: string;
}

async function insertUser(email: string, role: "pro" | "client", opts: Record<string, string | number | boolean> = {}) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const cols = ["email", "password_hash", "first_name", "last_name", "role", "is_active", ...Object.keys(opts)];
  const vals: (string | number | boolean)[] = [email, hash, "E2E", role === "pro" ? "Pro" : "Client", role, true, ...Object.values(opts)];
  const placeholders = cols.map(() => "?").join(", ");
  const [rows] = (await db.execute(
    `INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals
  )) as any[];
  return rows[0].id as number;
}

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  if (!res.body?.data?.accessToken) {
    throw new Error(`login échoué pour ${email} : ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function seed(): Promise<Seeded> {
  await cleanup(); // repart d'un état propre

  const proId = await insertUser(E("pro"), "pro", {
    activity_name: "E2E Availability Pro",
    city: "Paris",
    pro_status: "active",
    profile_visibility: "public",
    timezone: TZ,
    deposit_percentage: 0,
    accept_online_payment: false,
    cancellation_notice_hours: 24,
    uses_availability_engine: true,
  });
  const proInactiveId = await insertUser(E("pro-inactive"), "pro", {
    activity_name: "E2E Inactive",
    pro_status: "inactive",
    profile_visibility: "public",
    timezone: TZ,
    cancellation_notice_hours: 24,
  });
  const proPrivateId = await insertUser(E("pro-private"), "pro", {
    activity_name: "E2E Private",
    pro_status: "active",
    profile_visibility: "private",
    timezone: TZ,
    deposit_percentage: 0,
    cancellation_notice_hours: 24,
    uses_availability_engine: true,
  });
  // Pro NON migrée (chantier 4) : reste sur les slots précréés.
  const proLegacyId = await insertUser(E("pro-legacy"), "pro", {
    activity_name: "E2E Legacy",
    pro_status: "active",
    profile_visibility: "public",
    timezone: TZ,
    deposit_percentage: 0,
    cancellation_notice_hours: 24,
  });
  const client1Id = await insertUser(E("c1"), "client");
  const client2Id = await insertUser(E("c2"), "client");

  const [presta] = (await db.execute(
    `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active,
        buffer_before_minutes, buffer_after_minutes, is_online_bookable)
     VALUES (?, 'E2E Presta 60', 'jetable', 50, 60, TRUE, 0, 0, TRUE) RETURNING id`,
    [proId]
  )) as any[];
  const prestationId = presta[0].id as number;

  // La pro privée a besoin de sa propre prestation pour interroger sa dispo.
  const [prestaPriv] = (await db.execute(
    `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active,
        buffer_before_minutes, buffer_after_minutes, is_online_bookable)
     VALUES (?, 'E2E Presta privée', 'jetable', 50, 60, TRUE, 0, 0, TRUE) RETURNING id`,
    [proPrivateId]
  )) as any[];
  const prestationPrivateId = prestaPriv[0].id as number;

  const [prestaLegacy] = (await db.execute(
    `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active,
        buffer_before_minutes, buffer_after_minutes, is_online_bookable)
     VALUES (?, 'E2E Presta legacy', 'jetable', 50, 60, TRUE, 0, 0, TRUE) RETURNING id`,
    [proLegacyId]
  )) as any[];
  const prestationLegacyId = prestaLegacy[0].id as number;

  // 2 slots précréés pour la pro legacy le jour BASE (14:00 et 16:00 locale).
  for (const hhmm of ["14:00", "16:00"]) {
    const start = at(BASE, hhmm);
    await db.execute(
      `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
       VALUES (?, ?::timestamptz, ?::timestamptz + INTERVAL '60 minutes', 60, 'available')`,
      [proLegacyId, start, start]
    );
  }

  // working_hours : lun-ven 09:00-18:00 pour les scénarios 1-4, + dimanche
  // 09:00-18:00 pour les scénarios DST. Idem pour la pro privée (scénario 6).
  for (const pid of [proId, proPrivateId]) {
    for (const wd of [0, 1, 2, 3, 4, 5]) {
      await db.execute(
        `INSERT INTO working_hours (pro_id, weekday, start_time, end_time) VALUES (?, ?, '09:00', '18:00')`,
        [pid, wd]
      );
    }
  }

  return {
    proId,
    proInactiveId,
    proPrivateId,
    proLegacyId,
    client1Id,
    client2Id,
    prestationId,
    prestationPrivateId,
    prestationLegacyId,
    proToken: await login(E("pro")),
    proPrivateToken: await login(E("pro-private")),
    proLegacyToken: await login(E("pro-legacy")),
    client1Token: await login(E("c1")),
    client2Token: await login(E("c2")),
  };
}

// ── Cleanup (FK-safe) ─────────────────────────────────────────────────────
async function cleanup() {
  const [users] = (await db.query(
    `SELECT id FROM users WHERE email LIKE ?`,
    [`${EMAIL_PREFIX}%@blyss-loadtest.invalid`]
  )) as any[];
  if (users.length === 0) return;
  const ids = users.map((u: any) => Number(u.id)).join(",");

  await db.execute(`DELETE FROM reschedule_requests WHERE reservation_id IN (SELECT id FROM reservations WHERE pro_id IN (${ids}) OR client_id IN (${ids}))`, []);
  await db.execute(`DELETE FROM payments WHERE client_id IN (${ids})`, []);
  await db.execute(`DELETE FROM reservations WHERE pro_id IN (${ids}) OR client_id IN (${ids})`, []);
  await db.execute(`DELETE FROM notifications WHERE user_id IN (${ids})`, []);
  await db.execute(`DELETE FROM slots WHERE pro_id IN (${ids})`, []);
  await db.execute(`DELETE FROM working_hours WHERE pro_id IN (${ids})`, []);
  await db.execute(`DELETE FROM unavailabilities WHERE pro_id IN (${ids})`, []);
  await db.execute(`DELETE FROM prestations WHERE pro_id IN (${ids})`, []);
  await db.execute(`DELETE FROM users WHERE id IN (${ids})`, []);
}

// ── Scénarios ─────────────────────────────────────────────────────────────

async function scenario1(s: Seeded) {
  console.log("\n── Scénario 1 — Création normale (pro → dispo cliente) ──");
  const start = at(BASE, "14:00");
  const res = await request(app)
    .post("/api/pro/appointments")
    .set("Authorization", `Bearer ${s.proToken}`)
    .send({ client_id: s.client1Id, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60) });
  check(res.status === 200, `pro crée le RDV 14:00 → 200 (reçu ${res.status})`);
  check(res.body?.data?.override_applied === null, "override_applied = null");

  const proAvail = await request(app)
    .get(`/api/pro/${s.proId}/availability?service_ids=${s.prestationId}&from=${BASE}&to=${BASE}`)
    .set("Authorization", `Bearer ${s.proToken}`);
  const proStarts: string[] = (proAvail.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(!proStarts.includes(start), "14:00 n'apparaît plus dans la dispo pro");

  const pubAvail = await request(app).get(`/api/availability/${s.proId}?service_ids=${s.prestationId}&from=${BASE}&to=${BASE}`);
  const pubStarts: string[] = (pubAvail.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(!pubStarts.includes(start), "14:00 n'apparaît plus dans la dispo publique");
  check(pubStarts.includes(at(BASE, "09:00")), "les autres créneaux restent dispo (09:00)");

  const cliRes = await request(app)
    .post("/api/reservations")
    .set("Authorization", `Bearer ${s.client2Token}`)
    .send({ pro_id: s.proId, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60), payment_method: "on_site" });
  check(cliRes.status === 409, `cliente ne peut pas réserver 14:00 → 409 (reçu ${cliRes.status})`);
}

async function scenario2(s: Seeded) {
  console.log("\n── Scénario 2 — Double-booking concurrent ──");
  const start = at(BASE, "15:00");
  const body = { pro_id: s.proId, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60), payment_method: "on_site" };

  const [r1, r2] = await Promise.all([
    request(app).post("/api/reservations").set("Authorization", `Bearer ${s.client1Token}`).send(body),
    request(app).post("/api/reservations").set("Authorization", `Bearer ${s.client2Token}`).send(body),
  ]);
  const statuses = [r1.status, r2.status].sort();
  check(statuses[0] === 200 && statuses[1] === 409, `1×200 + 1×409 (reçu ${statuses.join("+")})`);
  const conflict = r1.status === 409 ? r1 : r2;
  check(conflict.body?.error === "SLOT_NO_LONGER_AVAILABLE", "409 → SLOT_NO_LONGER_AVAILABLE");
  check(Array.isArray(conflict.body?.alternativeSlots), "alternativeSlots présent dans le 409");

  const [rows] = (await db.query(
    `SELECT id FROM reservations WHERE pro_id = ? AND blocked_start_datetime = ? AND status NOT IN ('cancelled')`,
    [s.proId, start]
  )) as any[];
  check(rows.length === 1, `exactement 1 réservation en base pour 15:00 (reçu ${rows.length})`);
}

async function scenario3(s: Seeded) {
  console.log("\n── Scénario 3 — Override A (hors horaires) ──");
  const start = at(BASE, "19:00"); // hors 09:00-18:00
  const base = { client_id: s.client1Id, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60) };

  const refused = await request(app).post("/api/pro/appointments").set("Authorization", `Bearer ${s.proToken}`).send(base);
  check(refused.status === 409 && refused.body?.error === "OUTSIDE_WORKING_HOURS", `sans override → 409 OUTSIDE_WORKING_HOURS (reçu ${refused.status} ${refused.body?.error})`);
  check(refused.body?.canOverride === true, "canOverride = true");

  const ok = await request(app)
    .post("/api/pro/appointments")
    .set("Authorization", `Bearer ${s.proToken}`)
    .send({ ...base, manual_override: { mode: "outside_hours" } });
  check(ok.status === 200 && ok.body?.data?.override_applied === "outside_hours", `avec override → 200 override_applied=outside_hours (reçu ${ok.status})`);

  const [rows] = (await db.query(
    `SELECT manual_override_reason, manual_override_by_user_id, manual_override_at FROM reservations WHERE id = ?`,
    [ok.body?.data?.id]
  )) as any[];
  check(rows[0]?.manual_override_reason === "outside_hours", "DB : manual_override_reason = 'outside_hours'");
  check(rows[0]?.manual_override_by_user_id === s.proId && rows[0]?.manual_override_at != null, "DB : auteur + horodatage renseignés");

  const pub = await request(app).get(`/api/availability/${s.proId}?service_ids=${s.prestationId}&from=${BASE}&to=${BASE}`);
  const pubStarts: string[] = (pub.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(!pubStarts.includes(start), "19:00 n'est pas devenu réservable publiquement (pas d'élargissement des horaires)");
}

async function scenario4(s: Seeded) {
  console.log("\n── Scénario 4 — Override B (conflit volontaire) ──");
  const start = at(BASE, "16:00");
  // 1. RDV normal 16:00-17:00 (cliente 2)
  const first = await request(app)
    .post("/api/reservations")
    .set("Authorization", `Bearer ${s.client2Token}`)
    .send({ pro_id: s.proId, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60), payment_method: "on_site" });
  check(first.status === 200, `RDV initial 16:00 → 200 (reçu ${first.status})`);
  const firstId = first.body?.data?.id;

  // 2. Pro force le même créneau sans override → 409 + canOverride
  const base = { client_id: s.client1Id, prestation_id: s.prestationId, start_datetime: start, end_datetime: plusMin(start, 60) };
  const refused = await request(app).post("/api/pro/appointments").set("Authorization", `Bearer ${s.proToken}`).send(base);
  check(refused.status === 409 && refused.body?.error === "SLOT_NO_LONGER_AVAILABLE", `sans override → 409 SLOT_NO_LONGER_AVAILABLE (reçu ${refused.status} ${refused.body?.error})`);
  check(refused.body?.canOverride === true, "canOverride = true");

  // 3. Avec override conflict + motif → 200
  const ok = await request(app)
    .post("/api/pro/appointments")
    .set("Authorization", `Bearer ${s.proToken}`)
    .send({ ...base, manual_override: { mode: "conflict", note: "E2E — cliente prévenue, RDV maintenu" } });
  check(ok.status === 200 && ok.body?.data?.override_applied === "conflict", `avec override → 200 override_applied=conflict (reçu ${ok.status})`);

  const [rows] = (await db.query(
    `SELECT manual_override_reason, manual_override_note, manual_override_conflicts FROM reservations WHERE id = ?`,
    [ok.body?.data?.id]
  )) as any[];
  check(rows[0]?.manual_override_reason === "conflict", "DB : manual_override_reason = 'conflict'");
  check(!!rows[0]?.manual_override_note, "DB : motif renseigné");
  const conflicts = typeof rows[0]?.manual_override_conflicts === "string" ? JSON.parse(rows[0].manual_override_conflicts) : rows[0]?.manual_override_conflicts;
  check(Array.isArray(conflicts?.reservation_ids) && conflicts.reservation_ids.includes(Number(firstId)), "DB : manual_override_conflicts référence le RDV impacté");
  check(JSON.stringify(Object.keys(conflicts ?? {}).sort()) === JSON.stringify(["captured_at", "reservation_ids"]), "DB : manual_override_conflicts SANS PII (keys = captured_at + reservation_ids)");

  const pub = await request(app).get(`/api/availability/${s.proId}?service_ids=${s.prestationId}&from=${BASE}&to=${BASE}`);
  const pubStarts: string[] = (pub.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(!pubStarts.includes(start), "16:00 reste indisponible côté public");
}

async function scenario5(s: Seeded) {
  console.log("\n── Scénario 5 — DST (changement d'heure) ──");
  for (const [date, expectedFirst, label] of [
    [DST_FALL, at(DST_FALL, "09:00"), "recul (25 h) — 25/10/2026"],
    [DST_SPRING, at(DST_SPRING, "09:00"), "avance (23 h) — 28/03/2027"],
  ] as const) {
    const res = await request(app)
      .get(`/api/pro/${s.proId}/availability?service_ids=${s.prestationId}&from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${s.proToken}`);
    const slots: string[] = (res.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
    check(slots.length > 0, `${label} : des créneaux sont générés (${slots.length})`);
    check(slots[0] === expectedFirst, `${label} : 1er créneau = 09:00 local → ${expectedFirst}`);
    const ms = slots.map((x) => Date.parse(x));
    let regular = true;
    let noDup = true;
    for (let i = 1; i < ms.length; i++) {
      if (ms[i] - ms[i - 1] !== 15 * 60 * 1000) regular = false;
      if (ms[i] === ms[i - 1]) noDup = false;
    }
    check(regular, `${label} : espacement constant de 15 min (aucun trou)`);
    check(noDup, `${label} : aucun créneau dupliqué`);
  }
}

async function scenario6(s: Seeded) {
  console.log("\n── Scénario 6 — Pro désactivée / profil privé ──");
  const q = `service_ids=${s.prestationId}&from=${BASE}&to=${BASE}`;

  const inactivePub = await request(app).get(`/api/availability/${s.proInactiveId}?${q}`);
  check(inactivePub.status === 404, `pro inactive : GET public → 404 (reçu ${inactivePub.status})`);

  const privatePub = await request(app).get(`/api/availability/${s.proPrivateId}?${q}`);
  check(privatePub.status === 404, `pro profil privé : GET public → 404 (reçu ${privatePub.status})`);

  const privateOwn = await request(app)
    .get(`/api/pro/${s.proPrivateId}/availability?service_ids=${s.prestationPrivateId}&from=${BASE}&to=${BASE}`)
    .set("Authorization", `Bearer ${s.proPrivateToken}`);
  check(privateOwn.status === 200 && (privateOwn.body?.data?.days?.[0]?.slots?.length ?? 0) > 0, `pro profil privé : voit son propre planning → 200 avec créneaux (reçu ${privateOwn.status})`);

  const publicOk = await request(app).get(`/api/availability/${s.proId}?${q}`);
  check(publicOk.status === 200, `contrôle : pro publique active → 200 pour le public (reçu ${publicOk.status})`);
}

async function scenario7(s: Seeded) {
  console.log("\n── Scénario 7 — Bascule (chantier 4) : pro legacy + working-hours ──");

  // 7a. Pro NON migrée : /api/availability expose ses slots précréés (14:00, 16:00),
  //     PAS un calcul depuis working_hours (elle n'en a pas).
  const legacyPub = await request(app).get(`/api/availability/${s.proLegacyId}?service_ids=${s.prestationLegacyId}&from=${BASE}&to=${BASE}`);
  const legacyStarts: string[] = (legacyPub.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(legacyPub.status === 200, `pro legacy : GET availability → 200 (reçu ${legacyPub.status})`);
  check(
    legacyStarts.length === 2 && legacyStarts.includes(at(BASE, "14:00")) && legacyStarts.includes(at(BASE, "16:00")),
    `pro legacy : les 2 slots précréés (14:00, 16:00) sont exposés (reçu ${legacyStarts.length})`
  );

  // 7b. La pro legacy configure ses working_hours → bascule uses_availability_engine.
  const put1 = await request(app)
    .put("/api/pro/working-hours")
    .set("Authorization", `Bearer ${s.proLegacyToken}`)
    .send({ days: [{ weekday: 1, ranges: [{ start_time: "09:00", end_time: "12:30" }, { start_time: "13:30", end_time: "18:00" }] }] });
  check(put1.status === 200 && put1.body?.data?.migrated === true, `PUT working-hours → 200 migrated:true (reçu ${put1.status} ${put1.body?.data?.migrated})`);

  const [flagRows] = (await db.query(`SELECT uses_availability_engine FROM users WHERE id = ?`, [s.proLegacyId])) as any[];
  check(flagRows[0]?.uses_availability_engine === true, "DB : uses_availability_engine = true après la 1ʳᵉ sauvegarde");

  // 7c. Maintenant la dispo est CALCULÉE depuis working_hours (créneaux de 15 min),
  //     plus les slots précréés bruts.
  const after = await request(app).get(`/api/availability/${s.proLegacyId}?service_ids=${s.prestationLegacyId}&from=${BASE}&to=${BASE}`);
  const afterStarts: string[] = (after.body?.data?.days?.[0]?.slots ?? []).map((x: any) => x.start);
  check(afterStarts.length > 5 && afterStarts.includes(at(BASE, "09:00")), `pro migrée : dispo calculée depuis working_hours (${afterStarts.length} créneaux, dont 09:00)`);
  check(!afterStarts.includes(at(BASE, "12:45")), "pro migrée : la pause 12:30–13:30 est respectée (pas de créneau à 12:45)");

  // 7d. 2ᵉ sauvegarde : plus de migration.
  const put2 = await request(app)
    .put("/api/pro/working-hours")
    .set("Authorization", `Bearer ${s.proLegacyToken}`)
    .send({ days: [{ weekday: 1, ranges: [{ start_time: "10:00", end_time: "17:00" }] }] });
  check(put2.status === 200 && put2.body?.data?.migrated === false, "2ᵉ PUT working-hours → migrated:false");

  const get = await request(app).get("/api/pro/working-hours").set("Authorization", `Bearer ${s.proLegacyToken}`);
  check(get.status === 200 && get.body?.data?.days?.length === 7, "GET working-hours → 7 jours");
  check(get.body?.data?.days?.find((d: any) => d.weekday === 1)?.ranges?.[0]?.start_time === "10:00", "GET reflète la dernière sauvegarde");

  // 7e. Validation serveur : chevauchement → 422.
  const bad = await request(app)
    .put("/api/pro/working-hours")
    .set("Authorization", `Bearer ${s.proLegacyToken}`)
    .send({ days: [{ weekday: 2, ranges: [{ start_time: "09:00", end_time: "13:00" }, { start_time: "12:00", end_time: "18:00" }] }] });
  check(bad.status === 422 && bad.body?.error === "OVERLAPPING_RANGES", `plages qui se chevauchent → 422 OVERLAPPING_RANGES (reçu ${bad.status})`);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`E2E moteur de disponibilités — base lundi ${BASE}, DST ${DST_FALL} / ${DST_SPRING}`);
  let seeded: Seeded | null = null;
  try {
    seeded = await seed();
    console.log(`Seed OK — pro=${seeded.proId} (privée=${seeded.proPrivateId}, inactive=${seeded.proInactiveId}) clientes=${seeded.client1Id},${seeded.client2Id} prestation=${seeded.prestationId}`);
    await scenario1(seeded);
    await scenario2(seeded);
    await scenario3(seeded);
    await scenario4(seeded);
    await scenario5(seeded);
    await scenario6(seeded);
    await scenario7(seeded);
  } finally {
    await cleanup().catch((e) => console.error("⚠️  cleanup a échoué :", e?.message));
    console.log("\nCleanup effectué.");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Résultat : ${passed} assertions OK, ${failed} échec(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crash :", err);
  process.exit(1);
});
