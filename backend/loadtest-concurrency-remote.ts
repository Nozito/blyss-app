/**
 * Variante réseau de loadtest-concurrency-test.ts : tire N requêtes
 * strictement simultanées via HTTP réel contre une URL déployée (Railway,
 * 2 instances derrière son load balancer) au lieu d'importer l'app en
 * process — seule façon de prouver que le verrou advisory + le
 * UPDATE ... WHERE status='available' tiennent aussi quand les requêtes
 * concurrentes peuvent atterrir sur DEUX process Node différents, pas
 * juste sur des connexions différentes du même process.
 *
 * Usage (depuis la racine blyss-app) :
 *   BASE_URL=https://... DATABASE_URL=... node_modules/.bin/ts-node backend/loadtest-concurrency-remote.ts [N]
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });

import { getDb } from "./lib/db";
import bcrypt from "bcrypt";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const N = Number(process.argv[2] || 20);
const EMAIL_PRO = "loadtest-concurrency-remote-pro@blyss-loadtest.invalid";
const EMAIL_CLIENT = "loadtest-concurrency-remote-client@blyss-loadtest.invalid";
const PASSWORD = "Loadtest123!";

async function main() {
  const db = getDb();

  // ── Setup : pro + prestation + UN seul créneau, client, token ──────────
  const [existingPro] = (await db.query(`SELECT id FROM users WHERE email = ?`, [EMAIL_PRO])) as any[];
  let proId: number;
  if (existingPro.length > 0) {
    proId = existingPro[0].id;
  } else {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const [rows] = (await db.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, activity_name, city, pro_status, profile_visibility, is_active, cancellation_notice_hours, deposit_percentage, accept_online_payment)
       VALUES (?, ?, 'Loadtest', 'ConcurrencyRemote', 'pro', 'Loadtest Concurrency Remote', 'Paris', 'active', 'public', TRUE, 24, 0, FALSE)
       RETURNING id`,
      [EMAIL_PRO, hash]
    )) as any[];
    proId = rows[0].id;
  }

  const [presta] = (await db.execute(
    `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
     VALUES (?, 'Presta concurrency remote', 'jetable', 50, 60, TRUE) RETURNING id`,
    [proId]
  )) as any[];
  const prestationId = presta[0].id;

  const start = new Date(Date.now() + 20 * 86400 * 1000);
  start.setHours(11, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const [slotRow] = (await db.execute(
    `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
     VALUES (?, ?, ?, 60, 'available') RETURNING id`,
    [proId, start.toISOString(), end.toISOString()]
  )) as any[];
  const slotId = slotRow[0].id;

  await db.execute(`DELETE FROM users WHERE email = ?`, [EMAIL_CLIENT]);
  const clientHash = await bcrypt.hash(PASSWORD, 12);
  await db.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
     VALUES (?, ?, 'Loadtest', 'ClientRemote', 'client', TRUE)`,
    [EMAIL_CLIENT, clientHash]
  );

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL_CLIENT, password: PASSWORD }),
  });
  const loginBody = (await loginRes.json()) as any;
  const token = loginBody.data.accessToken;

  console.log(`Setup OK — pro=${proId} slot=${slotId} — cible ${BASE_URL} (2 instances Railway)`);
  console.log(`Envoi de ${N} requêtes HTTP réelles STRICTEMENT simultanées sur ce même créneau...`);

  const body = JSON.stringify({
    pro_id: proId,
    prestation_id: prestationId,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    slot_id: slotId,
    payment_method: "on_site",
    early_execution_requested: true,
  });

  const results = await Promise.all(
    Array.from({ length: N }, () =>
      fetch(`${BASE_URL}/api/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
      }).then((r) => r.status)
    )
  );

  const successes = results.filter((s) => s === 200).length;
  const conflicts = results.filter((s) => s === 409).length;
  const other = results.filter((s) => s !== 200 && s !== 409);

  console.log(`\nRésultats HTTP : ${successes} × 200, ${conflicts} × 409, ${other.length} × autre (${JSON.stringify(other)})`);

  const [dbReservations] = (await db.query(`SELECT id FROM reservations WHERE slot_id = ?`, [slotId])) as any[];
  console.log(`Réservations réelles en base pour ce slot_id : ${dbReservations.length}`);

  const httpOk = successes === 1 && conflicts === N - 1 && other.length === 0;
  const dbOk = dbReservations.length === 1;
  console.log(`\n${httpOk ? "✅" : "❌"} Exactement 1 succès HTTP + ${N - 1} conflits`);
  console.log(`${dbOk ? "✅" : "❌"} Exactement 1 ligne en base (pas de double-réservation sur infra multi-instance)`);

  await db.execute(`DELETE FROM reservations WHERE slot_id = ?`, [slotId]);
  await db.execute(`DELETE FROM slots WHERE id = ?`, [slotId]);
  await db.execute(`DELETE FROM prestations WHERE id = ?`, [prestationId]);
  await db.execute(`DELETE FROM users WHERE email = ?`, [EMAIL_CLIENT]);
  console.log("\nCleanup effectué. Le pro test survit (réutilisable).");

  process.exit(httpOk && dbOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Concurrency test (remote) failed:", err);
  process.exit(1);
});
