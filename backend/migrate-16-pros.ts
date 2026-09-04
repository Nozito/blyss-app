#!/usr/bin/env node
/**
 * Chantier 4.6b — bascule des 16 pros actives vers le moteur de disponibilité.
 *
 * Contexte (dry-run 2026-09-04) : aucune des 16 pros
 * (`role='pro' AND pro_status='active'`) n'a de ligne `working_hours`. Sans
 * horaires, le moteur ne calcule AUCUN créneau réservable, et le garde-fou M1
 * (`setWorkingHours`, revue sécurité / issue #10) repasserait le flag à FALSE.
 * Ce script SEED donc des horaires par défaut PUIS bascule
 * `uses_availability_engine = TRUE` — le tout dans UNE transaction par pro.
 *
 * Horaires par défaut : lundi→samedi 09:00–19:00, dimanche fermé.
 * (weekday : 0=dimanche … 6=samedi, cf. availability.service.ts `day.weekday % 7`.)
 * Chaque pro pourra les ajuster depuis l'app mobile ; ce ne sont que des valeurs
 * de démarrage pour rendre la bascule cohérente.
 *
 * Idempotent :
 *   - pro déjà `uses_availability_engine = TRUE`  → ignorée
 *   - pro ayant déjà ≥ 1 `working_hours`          → horaires existants respectés
 *     (aucune réinsertion), on bascule seulement le flag
 *   - relance après échec partiel : ne retouche que les pros encore en FALSE
 *
 * Réversible : snapshot JSON par pro (working_hours + slots) AVANT toute
 * écriture, dans backend/migration-snapshots/. Rollback : cf.
 * docs/RUNBOOK_migration-16-pros.md.
 *
 * Usage (depuis la racine blyss-app) :
 *   node_modules/.bin/ts-node backend/migrate-16-pros.ts --dry-run
 *   node_modules/.bin/ts-node backend/migrate-16-pros.ts --dry-run --clear-open-slots
 *   node_modules/.bin/ts-node backend/migrate-16-pros.ts --clear-open-slots
 *
 * Options :
 *   --dry-run            n'écrit rien, affiche le plan par pro
 *   --pro <id>           limite à cette pro
 *   --limit <n>          au plus n pros (batch progressif)
 *   --clear-open-slots   supprime (après snapshot) les slots `available` futurs
 *                        des pros basculées (Sophie #75 en a 57 ; les 15 autres 0)
 */
import path from "path";
import fs from "fs";
import { safeJoin } from "./lib/safe-path";

import type { getDb } from "./lib/db";

type Db = ReturnType<typeof getDb>;

/** lun→sam 09:00–19:00, dimanche (0) fermé. */
export const DEFAULT_WORKING_HOURS: { weekday: number; start_time: string; end_time: string }[] = [
  { weekday: 1, start_time: "09:00", end_time: "19:00" },
  { weekday: 2, start_time: "09:00", end_time: "19:00" },
  { weekday: 3, start_time: "09:00", end_time: "19:00" },
  { weekday: 4, start_time: "09:00", end_time: "19:00" },
  { weekday: 5, start_time: "09:00", end_time: "19:00" },
  { weekday: 6, start_time: "09:00", end_time: "19:00" },
];

export interface Migrate16Options {
  dryRun?: boolean;
  clearOpenSlots?: boolean;
  onlyProId?: number;
  limit?: number;
  workingHours?: { weekday: number; start_time: string; end_time: string }[];
  snapshotDir?: string;
  log?: (line: string) => void;
}

export interface ProRow {
  id: number;
  email: string;
  working_hours_count: number;
  open_future_slots: number;
  total_slots: number;
}

export interface Migrate16Result {
  scanned: number;
  seededHours: number[];
  migrated: number[];
  skippedHadHours: number[];
  failed: number[];
  openSlotsDeleted: Record<number, number>;
}

export async function runMigrate16(db: Db, opts: Migrate16Options = {}): Promise<Migrate16Result> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const snapshotDir = opts.snapshotDir ?? path.resolve(__dirname, "migration-snapshots");
  const hours = opts.workingHours ?? DEFAULT_WORKING_HOURS;

  const [rows] = (await db.query(
    `SELECT u.id, u.email,
            (SELECT COUNT(*) FROM working_hours w WHERE w.pro_id = u.id)::int AS working_hours_count,
            (SELECT COUNT(*) FROM slots s
               WHERE s.pro_id = u.id AND s.status = 'available'
                 AND s.end_datetime > NOW())::int AS open_future_slots,
            (SELECT COUNT(*) FROM slots s WHERE s.pro_id = u.id)::int AS total_slots
     FROM users u
     WHERE u.role = 'pro'
       AND u.pro_status = 'active'
       AND u.uses_availability_engine = FALSE
       ${opts.onlyProId ? "AND u.id = ?" : ""}
     ORDER BY u.id`,
    opts.onlyProId ? [opts.onlyProId] : []
  )) as [ProRow[], unknown];

  let targets = rows;
  if (opts.limit) targets = targets.slice(0, opts.limit);

  log(`Pros actives non migrées : ${rows.length}${opts.limit ? ` (limité à ${opts.limit})` : ""}`);
  log(`Horaires par défaut : ${hours.map((h) => `${h.weekday}:${h.start_time}-${h.end_time}`).join(", ")}`);

  const result: Migrate16Result = {
    scanned: rows.length,
    seededHours: [],
    migrated: [],
    skippedHadHours: [],
    failed: [],
    openSlotsDeleted: {},
  };

  if (opts.dryRun) {
    for (const r of targets) {
      const seed = r.working_hours_count === 0;
      const del = opts.clearOpenSlots ? r.open_future_slots : 0;
      log(
        `[dry-run] pro #${r.id} <${r.email}> — ` +
          `working_hours actuels=${r.working_hours_count} → ${seed ? `SEED ${hours.length} plages` : "inchangés"}, ` +
          `slots ouverts futurs=${r.open_future_slots}${del ? ` → ${del} supprimé(s)` : ""}, ` +
          `flag FALSE → TRUE`
      );
    }
    log(`\n[dry-run] ${targets.length} pro(s) seraient basculée(s). Aucune écriture.`);
    return result;
  }

  if (targets.length === 0) {
    log("Rien à faire.");
    return result;
  }

  fs.mkdirSync(snapshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const r of targets) {
    try {
      const [whRows] = (await db.query(
        `SELECT id, weekday, TO_CHAR(start_time,'HH24:MI') AS start_time,
                TO_CHAR(end_time,'HH24:MI') AS end_time
         FROM working_hours WHERE pro_id = ? ORDER BY weekday, start_time`,
        [r.id]
      )) as [Record<string, unknown>[], unknown];
      const [slotRows] = (await db.query(
        `SELECT id, start_datetime, end_datetime, duration, status, created_at
         FROM slots WHERE pro_id = ? ORDER BY start_datetime`,
        [r.id]
      )) as [Record<string, unknown>[], unknown];

      fs.writeFileSync(
        safeJoin(snapshotDir, `${stamp}-pro-${r.id}.json`),
        JSON.stringify(
          {
            pro_id: r.id,
            email: r.email,
            captured_at: new Date().toISOString(),
            uses_availability_engine_before: false,
            working_hours_before: whRows,
            slots: slotRows,
          },
          null,
          2
        )
      );

      let openDeleted = 0;
      const seedHours = whRows.length === 0;

      // SEED horaires + suppression slots ouverts + bascule flag = ATOMIQUE.
      // Un crash entre deux laisserait un état incohérent (flag TRUE sans
      // horaires → moteur sans borne, cf. M1 ; ou horaires sans flag).
      const cx = await db.getConnection();
      try {
        await cx.beginTransaction();

        if (seedHours) {
          for (const h of hours) {
            await cx.execute(
              `INSERT INTO working_hours (pro_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)`,
              [r.id, h.weekday, h.start_time, h.end_time]
            );
          }
        }

        if (opts.clearOpenSlots && r.open_future_slots > 0) {
          const [del] = (await cx.execute(
            `DELETE FROM slots WHERE pro_id = ? AND status = 'available' AND end_datetime > NOW() RETURNING id`,
            [r.id]
          )) as [unknown[], unknown];
          openDeleted = (del as unknown[]).length;
        }

        const [flagRows] = (await cx.execute(
          `UPDATE users SET uses_availability_engine = TRUE
           WHERE id = ? AND uses_availability_engine = FALSE RETURNING id`,
          [r.id]
        )) as [unknown[], unknown];

        if ((flagRows as unknown[]).length === 0) {
          // Course : quelqu'un a basculé la pro entre le SELECT et ici.
          throw new Error("flag déjà TRUE au moment de l'UPDATE (rollback seed)");
        }

        await cx.commit();
      } catch (err) {
        await cx.rollback().catch(() => {});
        throw err;
      } finally {
        cx.release();
      }

      if (seedHours) result.seededHours.push(r.id);
      else result.skippedHadHours.push(r.id);
      result.migrated.push(r.id);
      if (openDeleted) result.openSlotsDeleted[r.id] = openDeleted;

      log(
        `✅ pro #${r.id} <${r.email}> — ${seedHours ? `${hours.length} plages seedées` : "horaires existants conservés"}` +
          `${openDeleted ? `, ${openDeleted} slot(s) ouvert(s) supprimé(s)` : ""}, flag → TRUE`
      );
    } catch (err) {
      result.failed.push(r.id);
      log(`❌ pro #${r.id} <${r.email}> — échec, AUCUNE bascule (rollback) : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(
    `\n${result.migrated.length}/${targets.length} pro(s) basculée(s) — ` +
      `${result.seededHours.length} seedée(s), ${result.skippedHadHours.length} avec horaires préexistants, ` +
      `${result.failed.length} échec(s).`
  );
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

  runMigrate16(getDbRuntime(), {
    dryRun: has("--dry-run"),
    clearOpenSlots: has("--clear-open-slots"),
    onlyProId: flagVal("--pro") ? Number(flagVal("--pro")) : undefined,
    limit: flagVal("--limit") ? Number(flagVal("--limit")) : undefined,
  })
    .then((r) => process.exit(r.failed.length === 0 ? 0 : 1))
    .catch((err) => {
      console.error("migrate-16-pros a échoué :", err);
      process.exit(1);
    });
}
