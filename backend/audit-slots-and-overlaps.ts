#!/usr/bin/env node
/**
 * Chantier 4.6 — audit préalable à la dépréciation des slots précréés et à
 * l'ajout de la contrainte EXCLUDE USING gist sur `reservations`.
 *
 * Rapporte (lecture seule) :
 *   1. Avancement de la bascule (pros migrées / total)
 *   2. Slots restants par pro (dont pros migrées = orphelins à supprimer en 4.6b)
 *   3. Réservations non annulées SANS blocked_start_datetime (le snapshot 3.2
 *      n'a backfillé que le futur — ces lignes ne seront pas couvertes par la
 *      contrainte, ce qui est acceptable)
 *   4. Paires de réservations qui SE CHEVAUCHENT (hors override 'conflict'
 *      volontaire) → BLOQUENT l'ajout de la contrainte EXCLUDE tant qu'elles
 *      existent. À résoudre (données de seed, ou annulation manuelle).
 *
 * Usage : node_modules/.bin/ts-node backend/audit-slots-and-overlaps.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.dev") });

import { getDb } from "./lib/db";

async function main() {
  const db = getDb();
  const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params))[0] as any[];

  console.log("═".repeat(64));
  console.log("AUDIT — dépréciation slots + contrainte EXCLUDE (chantier 4.6)");
  console.log("═".repeat(64));

  // 1. Avancement de la bascule
  const [{ total }] = await q(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'pro'`);
  const [{ migrated }] = await q(`SELECT COUNT(*)::int AS migrated FROM users WHERE uses_availability_engine`);
  const [{ active_migrated }] = await q(
    `SELECT COUNT(*)::int AS active_migrated FROM users WHERE role = 'pro' AND pro_status = 'active' AND uses_availability_engine`
  );
  const [{ active_total }] = await q(
    `SELECT COUNT(*)::int AS active_total FROM users WHERE role = 'pro' AND pro_status = 'active'`
  );
  console.log(`\n1. Bascule : ${migrated}/${total} pros migrées ` +
    `(actives : ${active_migrated}/${active_total} = ${active_total ? Math.round((100 * active_migrated) / active_total) : 0} %)`);
  console.log(active_migrated === active_total
    ? "   ✅ toutes les pros actives sont migrées → 4.6b (DROP slot_id / DROP TABLE slots) possible"
    : "   ⏳ 4.6b (DROP slot_id / DROP TABLE slots) doit attendre 100 % des pros actives");

  // 2. Slots restants
  const slotsByPro = await q(
    `SELECT s.pro_id, u.uses_availability_engine, u.pro_status,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE s.status = 'available' AND s.end_datetime > NOW())::int AS open_future
     FROM slots s JOIN users u ON u.id = s.pro_id
     GROUP BY s.pro_id, u.uses_availability_engine, u.pro_status
     ORDER BY total DESC`
  );
  const totalSlots = slotsByPro.reduce((n, r) => n + r.total, 0);
  const orphanSlots = slotsByPro.filter((r) => r.uses_availability_engine).reduce((n, r) => n + r.total, 0);
  console.log(`\n2. Slots : ${totalSlots} au total, dont ${orphanSlots} appartenant à des pros DÉJÀ migrées (orphelins).`);
  for (const r of slotsByPro.slice(0, 15)) {
    console.log(`   pro #${r.pro_id} — ${r.total} slot(s) (${r.open_future} ouverts à venir) ` +
      `${r.uses_availability_engine ? "[migrée → orphelins]" : "[legacy]"}`);
  }

  // 3. Réservations sans snapshot
  const [{ missing }] = await q(
    `SELECT COUNT(*)::int AS missing FROM reservations
     WHERE status <> 'cancelled' AND blocked_start_datetime IS NULL`
  );
  const [{ missing_future }] = await q(
    `SELECT COUNT(*)::int AS missing_future FROM reservations
     WHERE status NOT IN ('cancelled', 'completed') AND blocked_start_datetime IS NULL AND end_datetime > NOW()`
  );
  console.log(`\n3. Réservations non annulées sans blocked_start_datetime : ${missing} ` +
    `(dont ${missing_future} à venir — À BACKFILLER avant la contrainte)`);

  // 4. Chevauchements existants (hors override 'conflict')
  const overlaps = await q(
    `SELECT a.pro_id, COUNT(*)::int AS pairs
     FROM reservations a
     JOIN reservations b
       ON a.pro_id = b.pro_id AND a.id < b.id
      AND a.status <> 'cancelled' AND b.status <> 'cancelled'
      AND a.blocked_start_datetime IS NOT NULL AND b.blocked_start_datetime IS NOT NULL
      AND COALESCE(a.manual_override_reason, '') <> 'conflict'
      AND COALESCE(b.manual_override_reason, '') <> 'conflict'
      AND tstzrange(a.blocked_start_datetime, a.blocked_end_datetime)
       && tstzrange(b.blocked_start_datetime, b.blocked_end_datetime)
     GROUP BY a.pro_id
     ORDER BY pairs DESC`
  );
  const totalPairs = overlaps.reduce((n, r) => n + r.pairs, 0);
  console.log(`\n4. Chevauchements bloquant la contrainte EXCLUDE : ${totalPairs} paire(s) sur ${overlaps.length} pro(s)`);
  for (const r of overlaps) {
    const [{ email }] = await q(`SELECT email FROM users WHERE id = ?`, [r.pro_id]);
    console.log(`   pro #${r.pro_id} <${email}> — ${r.pairs} paire(s)`);
  }
  console.log(
    totalPairs === 0
      ? "   ✅ aucun chevauchement → la migration 20260904000001 (EXCLUDE) peut être appliquée"
      : "   ❌ résoudre ces chevauchements (données de seed ? annulation manuelle ?) AVANT d'appliquer 20260904000001"
  );

  console.log("\n" + "═".repeat(64));
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
