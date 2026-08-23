/**
 * Preuve de non-double-réservation sous charge concurrente réelle — pas un
 * mock. Crée UN seul créneau disponible, tire N requêtes POST
 * /api/reservations strictement simultanées dessus (Promise.all, pas de
 * séquencement), et vérifie :
 *   1. Exactement 1 réponse 200
 *   2. Exactement N-1 réponses 409
 *   3. La base contient exactement 1 réservation pour ce slot_id (vérité
 *      terrain, indépendante de ce que l'API a répondu)
 *
 * Exécute le vrai app.ts (vraie DB via pooler, pas de mock lib/db) — le
 * verrou pg_advisory_xact_lock() et le UPDATE ... WHERE status='available'
 * sont donc réellement exercés, pas simulés.
 *
 * Usage (depuis la racine blyss-app) :
 *   DATABASE_URL=... node_modules/.bin/ts-node backend/loadtest-concurrency-test.ts [N]
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });
// NODE_ENV=test : server.ts n'appelle pas app.listen() ni les crons (déjà le
// comportement attendu par supertest, cf. commentaire dans server.ts) — on
// importe juste l'app Express, pas un process serveur complet.
process.env.NODE_ENV = "test";
process.env.LOADTEST_BYPASS_RATE_LIMIT = "true"; // N requêtes simultanées depuis 1 process = 1 IP

import request from "supertest";
import { app } from "./server";
import { getDb } from "./lib/db";
import bcrypt from "bcrypt";

const N = Number(process.argv[2] || 20);
const EMAIL = "loadtest-concurrency@blyss-loadtest.invalid";
const PASSWORD = "Loadtest123!";

async function main() {
  const db = getDb();

  // ── Setup : un pro, une prestation, UN seul créneau ────────────────────
  const [existingPro] = (await db.query(`SELECT id FROM users WHERE email = ?`, [EMAIL])) as any[];
  let proId: number;
  if (existingPro.length > 0) {
    proId = existingPro[0].id;
  } else {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const [rows] = (await db.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, activity_name, city, pro_status, profile_visibility, is_active, cancellation_notice_hours, deposit_percentage, accept_online_payment)
       VALUES (?, ?, 'Loadtest', 'Concurrency', 'pro', 'Loadtest Concurrency', 'Paris', 'active', 'public', TRUE, 24, 0, FALSE)
       RETURNING id`,
      [EMAIL, hash]
    )) as any[];
    proId = rows[0].id;
  }

  const [presta] = (await db.execute(
    `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
     VALUES (?, 'Presta concurrency test', 'jetable', 50, 60, TRUE) RETURNING id`,
    [proId]
  )) as any[];
  const prestationId = presta[0].id;

  const start = new Date(Date.now() + 20 * 86400 * 1000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const [slotRow] = (await db.execute(
    `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
     VALUES (?, ?, ?, 60, 'available') RETURNING id`,
    [proId, start.toISOString(), end.toISOString()]
  )) as any[];
  const slotId = slotRow[0].id;

  // ── Client unique — un seul token, réutilisé pour les N requêtes.
  // La garantie testée porte sur l'état du SLOT, pas sur l'identité du
  // client : réutiliser le même compte simplifie le setup sans affaiblir
  // la preuve (le verrou/UPDATE ne discrimine pas selon client_id).
  await db.execute(`DELETE FROM users WHERE email = ?`, ["loadtest-concurrency-client@blyss-loadtest.invalid"]);
  const clientHash = await bcrypt.hash(PASSWORD, 12);
  await db.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
     VALUES (?, ?, 'Loadtest', 'Client', 'client', TRUE)`,
    ["loadtest-concurrency-client@blyss-loadtest.invalid", clientHash]
  );
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "loadtest-concurrency-client@blyss-loadtest.invalid", password: PASSWORD });
  const token = loginRes.body.data.accessToken;

  console.log(`Setup OK — pro=${proId} prestation=${prestationId} slot=${slotId} (1 seul créneau dispo)`);
  console.log(`Envoi de ${N} requêtes POST /api/reservations STRICTEMENT simultanées sur ce même slot...`);

  // ── Le test : N requêtes tirées en parallèle, aucun séquencement ───────
  const body = {
    pro_id: proId,
    prestation_id: prestationId,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    slot_id: slotId,
    payment_method: "on_site",
    early_execution_requested: true,
  };

  const results = await Promise.all(
    Array.from({ length: N }, () =>
      request(app).post("/api/reservations").set("Authorization", `Bearer ${token}`).send(body)
    )
  );

  const successes = results.filter((r) => r.status === 200);
  const conflicts = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 200 && r.status !== 409);

  console.log(`\nRésultats HTTP : ${successes.length} × 200, ${conflicts.length} × 409, ${other.length} × autre`);
  if (other.length > 0) {
    console.log("Statuts inattendus :", other.map((r) => `${r.status} ${JSON.stringify(r.body)}`));
  }

  // ── Vérité terrain : compter les réservations réelles en base ─────────
  const [dbReservations] = (await db.query(
    `SELECT id, client_id FROM reservations WHERE slot_id = ?`,
    [slotId]
  )) as any[];

  console.log(`Réservations réelles en base pour ce slot_id : ${dbReservations.length}`);

  const httpOk = successes.length === 1 && conflicts.length === N - 1 && other.length === 0;
  const dbOk = dbReservations.length === 1;

  console.log(`\n${httpOk ? "✅" : "❌"} Exactement 1 succès HTTP + ${N - 1} conflits`);
  console.log(`${dbOk ? "✅" : "❌"} Exactement 1 ligne en base pour ce créneau (pas de double-réservation)`);

  // ── Cleanup ──────────────────────────────────────────────────────────
  await db.execute(`DELETE FROM reservations WHERE slot_id = ?`, [slotId]);
  await db.execute(`DELETE FROM slots WHERE id = ?`, [slotId]);
  await db.execute(`DELETE FROM prestations WHERE id = ?`, [prestationId]);
  await db.execute(`DELETE FROM users WHERE email = ?`, ["loadtest-concurrency-client@blyss-loadtest.invalid"]);
  console.log("\nCleanup effectué (réservation, slot, prestation, client test).");
  console.log("Le pro test survit (réutilisable) — nettoyer avec loadtest-cleanup.ts --include-pro si besoin.");

  process.exit(httpOk && dbOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Concurrency test failed:", err);
  process.exit(1);
});
