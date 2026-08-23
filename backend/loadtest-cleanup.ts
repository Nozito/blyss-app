#!/usr/bin/env node
/**
 * Purge toutes les données créées par les runs k6 (../loadtest/scenarios/*.js) :
 * tout utilisateur dont l'email matche loadtest-*@blyss-loadtest.invalid,
 * plus ses réservations/paiements. Ne touche jamais aux comptes fixtures
 * (camille@blyss.dev etc.) ni à aucune donnée réelle.
 *
 * Placé dans backend/ (et pas loadtest/) pour résoudre `pg` depuis
 * backend/node_modules — loadtest/ n'a pas son propre node_modules.
 *
 * Usage (depuis la racine blyss-app) : node_modules/.bin/ts-node backend/loadtest-cleanup.ts [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });

// Réutilise lib/db.ts (mode pg direct ou fallback Management API selon le
// réseau) plutôt que de réimplémenter la connexion — un pg.Pool direct
// échoue ici en local (IPv4/IPv6 selon la machine), exactement ce que
// detectMode() dans lib/db.ts gère déjà pour server.ts.
import { getDb } from "./lib/db";

const DRY_RUN = process.argv.includes("--dry-run");
const EMAIL_PATTERN = "loadtest-%@blyss-loadtest.invalid";
// Pros jetables réutilisés d'un run à l'autre (backend/loadtest-seed-pro.ts,
// loadtest-pro-1, loadtest-pro-2, ...) — exclus du nettoyage client pour ne
// pas devoir les re-seeder à chaque fois. Nettoyer TOUT (y compris ces pros)
// reste possible avec --include-pro.
const PRO_EMAIL_PATTERN = "loadtest-pro-%@blyss-loadtest.invalid";
const INCLUDE_PRO = process.argv.includes("--include-pro");

async function main() {
  const db = getDb();

  const [users] = INCLUDE_PRO
    ? await db.query(`SELECT id, email FROM users WHERE email LIKE ?`, [EMAIL_PATTERN])
    : await db.query(`SELECT id, email FROM users WHERE email LIKE ? AND email NOT LIKE ?`, [EMAIL_PATTERN, PRO_EMAIL_PATTERN]);

  if (users.length === 0) {
    console.log("Rien à nettoyer — aucun compte loadtest- trouvé.");
    process.exit(0);
  }

  console.log(`${users.length} compte(s) loadtest- trouvé(s).`);
  if (DRY_RUN) {
    console.log("--dry-run : aucune suppression effectuée.");
    console.log(users.map((u) => u.email).join("\n"));
    process.exit(0);
  }

  // IN (...) avec des entiers déjà validés (issus de notre propre SELECT id
  // FROM users, jamais d'entrée utilisateur) — le fallback Management API
  // sérialise les tableaux passés en paramètre en JSON, incompatible avec
  // ANY(?) côté Postgres (attend '{...}', pas '[...]').
  //
  // RETURNING id + .length plutôt que .rowCount : le wrapper getDb() ne
  // renvoie jamais un objet QueryResult avec rowCount, ni en mode pg
  // (renvoie r.rows, un tableau nu) ni en mode Management API (renvoie les
  // lignes JSON telles quelles) — RETURNING est la seule façon fiable de
  // compter les lignes affectées dans les deux modes.
  const idList = users.map((u) => Number(u.id)).join(",");

  const [payments] = (await db.execute(`DELETE FROM payments WHERE client_id IN (${idList}) RETURNING id`, [])) as any[];
  const [reservations] = (await db.execute(`DELETE FROM reservations WHERE client_id IN (${idList}) RETURNING id`, [])) as any[];
  const [messages] = (await db.execute(`DELETE FROM messages WHERE sender_id IN (${idList}) RETURNING id`, [])) as any[];
  const [threads] = (await db.execute(`DELETE FROM message_threads WHERE client_id IN (${idList}) RETURNING id`, [])) as any[];
  const [deletedUsers] = (await db.execute(`DELETE FROM users WHERE id IN (${idList}) RETURNING id`, [])) as any[];

  console.log(
    `Supprimés — payments: ${payments.length}, reservations: ${reservations.length}, messages: ${messages.length}, threads: ${threads.length}, users: ${deletedUsers.length}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
