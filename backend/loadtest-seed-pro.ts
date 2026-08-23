/**
 * Crée N pros 100% jetables (email loadtest-pro-N@blyss-loadtest.invalid)
 * avec une prestation active et des créneaux disponibles sur 30 jours
 * chacun, pour exercer le parcours réservation en stress test sans toucher
 * au fixture partagé camille@blyss.dev (seed.sql — dont la disponibilité
 * est obsolète) — et SANS créer de contention artificielle sur l'advisory
 * lock (scopé par pro_id) en concentrant tout le trafic réservation sur un
 * seul pro, ce qu'aucun trafic réel ne ferait jamais.
 *
 * prestations/slots ont ON DELETE CASCADE sur pro_id (schema.sql) — un
 * DELETE FROM users suffit à tout nettoyer (déjà géré par
 * loadtest-cleanup.ts, qui matche ces comptes via le préfixe loadtest-).
 *
 * Usage (depuis la racine blyss-app) :
 *   node_modules/.bin/ts-node backend/loadtest-seed-pro.ts [N]
 * Écrit la liste des {proId, prestationId} dans loadtest/pros.json,
 * consommée par loadtest/scenarios/mixed.js.
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import bcrypt from "bcrypt";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });

import { getDb } from "./lib/db";

const COUNT = Number(process.argv[2] || 1);
const PASSWORD = "Loadtest123!";
const MANIFEST_PATH = path.resolve(__dirname, "..", "loadtest", "pros.json");

async function seedOnePro(index: number, db: ReturnType<typeof getDb>): Promise<{ proId: number; prestationId: number }> {
  const email = `loadtest-pro-${index}@blyss-loadtest.invalid`;

  const [existing] = (await db.query(`SELECT id FROM users WHERE email = ?`, [email])) as any[];
  let proId: number;

  if (existing.length > 0) {
    proId = existing[0].id;
  } else {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const [rows] = (await db.execute(
      `INSERT INTO users (
         email, password_hash, first_name, last_name, role,
         activity_name, city, pro_status, profile_visibility, is_active,
         cancellation_notice_hours, deposit_percentage, accept_online_payment
       ) VALUES (?, ?, 'Loadtest', ?, 'pro',
         ?, 'Paris', 'active', 'public', TRUE,
         24, 0, FALSE)
       RETURNING id`,
      [email, passwordHash, `Pro ${index}`, `Loadtest Studio ${index}`]
    )) as any[];
    proId = rows[0].id;
  }

  const [existingPresta] = (await db.query(
    `SELECT id FROM prestations WHERE pro_id = ? AND active = TRUE LIMIT 1`,
    [proId]
  )) as any[];
  let prestationId: number;

  if (existingPresta.length > 0) {
    prestationId = existingPresta[0].id;
  } else {
    const [presta] = (await db.execute(
      `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
       VALUES (?, 'Prestation loadtest', 'Créée pour stress test — jamais réelle', 50, 60, TRUE)
       RETURNING id`,
      [proId]
    )) as any[];
    prestationId = presta[0].id;
  }

  // Purge les anciens créneaux 'available' avant régénération (idempotent
  // d'un run à l'autre, évite l'accumulation si le script est relancé).
  await db.execute(`DELETE FROM slots WHERE pro_id = ? AND status = 'available'`, [proId]);

  // 30 jours × 8 créneaux/jour (9h-17h, 1h chacun) par pro.
  const values: string[] = [];
  const params: unknown[] = [];
  const now = new Date();

  for (let day = 1; day <= 30; day++) {
    for (let hour = 9; hour < 17; hour++) {
      const start = new Date(now);
      start.setDate(start.getDate() + day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      values.push(`(?, ?, ?, 60, 'available')`);
      params.push(proId, start.toISOString(), end.toISOString());
    }
  }

  const insertSql = `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status) VALUES ${values.join(",")}`;
  await db.execute(insertSql, params);

  return { proId, prestationId };
}

async function main() {
  const db = getDb();
  const pros: Array<{ proId: number; prestationId: number }> = [];

  for (let i = 1; i <= COUNT; i++) {
    const result = await seedOnePro(i, db);
    pros.push(result);
    console.log(`Pro ${i}/${COUNT} — id=${result.proId} prestation=${result.prestationId}`);
  }

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(pros, null, 2));
  console.log(`\n${pros.length} pro(s) prêt(s), 240 créneaux chacun. Manifeste écrit : ${MANIFEST_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
