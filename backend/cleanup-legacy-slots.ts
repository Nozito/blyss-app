#!/usr/bin/env node
/**
 * Chantier 4.6b — suppression des slots précréés des pros DÉJÀ migrées vers le
 * moteur de disponibilités (uses_availability_engine = TRUE).
 *
 * Placé dans backend/ (comme migrate-pros-to-availability-engine.ts) pour
 * résoudre `pg` / lib/db depuis backend/node_modules.
 *
 * Pour une pro migrée, ses créneaux découlent de `working_hours` : les lignes
 * `slots` ne sont plus lues (l'adaptateur 4.1 court-circuite `fetchSlots`) et ne
 * font qu'encombrer la table. Ce script les retire, après snapshot.
 *
 * GARDE-FOUS (non destructif par défaut) :
 *   - dry-run par défaut : il faut --execute pour écrire quoi que ce soit
 *   - ne touche QUE les pros où uses_availability_engine = TRUE
 *   - snapshot JSON de tous les slots supprimés (backend/migration-snapshots/)
 *   - une pro dont un slot est encore référencé par une réservation non annulée
 *     est IGNORÉE (sauf --force-booked) — la FK est ON DELETE SET NULL, mais on
 *     préfère investiguer une réservation active encore liée à un slot
 *   - suppression par pro, dans une transaction
 *
 * Usage (depuis la racine blyss-app) :
 *   node_modules/.bin/ts-node backend/cleanup-legacy-slots.ts [options]
 *
 * Options :
 *   --execute        applique réellement les suppressions (sinon dry-run)
 *   --pro <id>       limite à cette pro
 *   --batch <n>      au plus n pros (batch progressif)
 *   --force-booked   supprime même si des réservations non annulées pointent
 *                    encore vers un slot (le slot_id passera à NULL)
 */
import path from "path";
import fs from "fs";
import { safeJoin } from "./lib/safe-path";

import type { getDb } from "./lib/db";

type Db = ReturnType<typeof getDb>;

export interface CleanupOptions {
  /** false = applique les suppressions. Défaut : true (dry-run). */
  dryRun?: boolean;
  onlyProId?: number;
  batch?: number;
  forceBooked?: boolean;
  /** Répertoire des snapshots ; défaut backend/migration-snapshots. */
  snapshotDir?: string;
  log?: (line: string) => void;
}

export interface MigratedProWithSlots {
  id: number;
  email: string;
  slot_count: number;
  open_future: number;
}

export interface CleanupResult {
  scanned: number;
  cleaned: number[];
  skippedBooked: number[];
  failed: number[];
  deletedSlots: number;
}

export async function runCleanup(db: Db, opts: CleanupOptions = {}): Promise<CleanupResult> {
  const dryRun = opts.dryRun !== false;
  const log = opts.log ?? ((l: string) => console.log(l));
  const snapshotDir = opts.snapshotDir ?? path.resolve(__dirname, "migration-snapshots");

  const [rows] = (await db.query(
    `SELECT u.id, u.email,
            COUNT(s.id)::int AS slot_count,
            COUNT(s.id) FILTER (WHERE s.status = 'available' AND s.end_datetime > NOW())::int AS open_future
     FROM users u
     JOIN slots s ON s.pro_id = u.id
     WHERE u.uses_availability_engine = TRUE
       ${opts.onlyProId ? "AND u.id = ?" : ""}
     GROUP BY u.id, u.email
     HAVING COUNT(s.id) > 0
     ORDER BY u.id`,
    opts.onlyProId ? [opts.onlyProId] : []
  )) as [MigratedProWithSlots[], unknown];

  log("═".repeat(64));
  log(`NETTOYAGE slots legacy — pros migrées avec slots restants : ${rows.length}` +
    (dryRun ? "  [DRY-RUN — aucune écriture]" : "  [EXECUTE]"));
  log("═".repeat(64));

  const result: CleanupResult = {
    scanned: rows.length,
    cleaned: [],
    skippedBooked: [],
    failed: [],
    deletedSlots: 0,
  };

  const targets = opts.batch ? rows.slice(0, opts.batch) : rows;
  if (opts.batch && rows.length > opts.batch) {
    log(`(batch limité à ${opts.batch} pro(s) sur ${rows.length})`);
  }

  if (!dryRun) fs.mkdirSync(snapshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const pro of targets) {
    try {
      const [bookedRows] = (await db.query(
        `SELECT r.id, r.slot_id, r.status
         FROM reservations r
         WHERE r.pro_id = ? AND r.slot_id IS NOT NULL AND r.status <> 'cancelled'`,
        [pro.id]
      )) as [Array<{ id: number; slot_id: number; status: string }>, unknown];

      if (bookedRows.length > 0 && !opts.forceBooked) {
        result.skippedBooked.push(pro.id);
        log(`⏭️  pro #${pro.id} <${pro.email}> — ${pro.slot_count} slot(s) mais ` +
          `${bookedRows.length} réservation(s) non annulée(s) encore liée(s) (slot_id). ` +
          `IGNORÉE (utilise --force-booked pour forcer).`);
        continue;
      }

      const [slotRows] = (await db.query(
        `SELECT id, start_datetime, end_datetime, duration, status, created_at
         FROM slots WHERE pro_id = ? ORDER BY start_datetime`,
        [pro.id]
      )) as [Record<string, unknown>[], unknown];

      if (dryRun) {
        log(`[dry-run] pro #${pro.id} <${pro.email}> — supprimerait ${slotRows.length} slot(s) ` +
          `(${pro.open_future} ouverts à venir)` +
          (bookedRows.length ? `, ${bookedRows.length} réservation(s) verraient slot_id → NULL` : ""));
        continue;
      }

      fs.writeFileSync(
        safeJoin(snapshotDir, `${stamp}-cleanup-pro-${pro.id}.json`),
        JSON.stringify(
          {
            pro_id: pro.id,
            email: pro.email,
            captured_at: new Date().toISOString(),
            reason: "cleanup-legacy-slots (chantier 4.6b)",
            reservations_unlinked: bookedRows,
            slots: slotRows,
          },
          null,
          2
        )
      );

      const cx = await db.getConnection();
      try {
        await cx.beginTransaction();
        const [del] = (await cx.execute(
          `DELETE FROM slots WHERE pro_id = ? RETURNING id`,
          [pro.id]
        )) as [unknown[], unknown];
        await cx.commit();
        result.cleaned.push(pro.id);
        result.deletedSlots += (del as unknown[]).length;
        log(`✅ pro #${pro.id} <${pro.email}> — ${(del as unknown[]).length} slot(s) supprimé(s) ` +
          `(snapshot ${slotRows.length} ligne(s))`);
      } catch (err) {
        await cx.rollback();
        throw err;
      } finally {
        cx.release();
      }
    } catch (err) {
      result.failed.push(pro.id);
      log(`❌ pro #${pro.id} <${pro.email}> — échec : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log("\n" + "─".repeat(64));
  log(`Résumé : ${result.cleaned.length} pro(s) nettoyée(s), ${result.deletedSlots} slot(s) supprimé(s), ` +
    `${result.skippedBooked.length} ignorée(s) (réservations liées), ${result.failed.length} échec(s).`);
  if (dryRun) log("DRY-RUN — relance avec --execute pour appliquer.");
  return result;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.dev") });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDb: getDbRuntime } = require("./lib/db") as { getDb: typeof getDb };

  const argv = process.argv.slice(2);
  const has = (f: string) => argv.includes(f);
  const flagVal = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  runCleanup(getDbRuntime(), {
    dryRun: !has("--execute"),
    forceBooked: has("--force-booked"),
    onlyProId: flagVal("--pro") ? Number(flagVal("--pro")) : undefined,
    batch: flagVal("--batch") ? Number(flagVal("--batch")) : undefined,
  })
    .then((r) => process.exit(r.failed.length === 0 ? 0 : 1))
    .catch((err) => {
      console.error("Cleanup script failed:", err);
      process.exit(1);
    });
}
