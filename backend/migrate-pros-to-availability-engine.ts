#!/usr/bin/env node
/**
 * Chantier 4.2 — bascule des pros vers le moteur de disponibilités.
 *
 * Placé dans backend/ (comme loadtest-*.ts) pour résoudre `pg` / lib/db depuis
 * backend/node_modules.
 *
 * Critères d'éligibilité (conservateurs par défaut) :
 *   1. users.uses_availability_engine = FALSE
 *   2. role = 'pro' ET pro_status = 'active'
 *   3. ≥ 1 ligne dans working_hours
 *   4. AUCUN slot "ouvert" à venir (status='available' ET fin > NOW())
 *      → avec --force-clear-open : snapshot PUIS suppression sèche de ces slots
 *        (design chantier 4, réponse CTO §Q2), la pro devient alors éligible
 *
 * Pour chaque pro basculée :
 *   - snapshot JSON de TOUS ses slots (audit / rollback)
 *   - UPDATE users SET uses_availability_engine = TRUE
 *   - log : pro_id, email, working_hours_count, slots_snapshot_count, open_deleted
 *
 * Usage (depuis la racine blyss-app) :
 *   node_modules/.bin/ts-node backend/migrate-pros-to-availability-engine.ts [options]
 *
 * Options :
 *   --dry-run            n'écrit rien, affiche seulement le plan
 *   --pro <id>           limite à cette pro
 *   --limit <n>          au plus n pros (batch progressif)
 *   --force-clear-open   supprime (après snapshot) les slots ouverts à venir
 */
import path from "path";
import fs from "fs";
import { safeJoin } from "./lib/safe-path";

import type { getDb } from "./lib/db";

type Db = ReturnType<typeof getDb>;

export interface MigrateOptions {
  dryRun?: boolean;
  forceClearOpen?: boolean;
  onlyProId?: number;
  limit?: number;
  /** Répertoire des snapshots ; défaut backend/migration-snapshots. */
  snapshotDir?: string;
  log?: (line: string) => void;
}

export interface EligibleProRow {
  id: number;
  email: string;
  working_hours_count: number;
  open_future_slots: number;
  total_slots: number;
}

export interface MigrateResult {
  scanned: number;
  withHours: number;
  blockedByOpenSlots: number[];
  migrated: number[];
  failed: number[];
}

export async function runMigration(db: Db, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const snapshotDir = opts.snapshotDir ?? path.resolve(__dirname, "migration-snapshots");

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
  )) as [EligibleProRow[], unknown];

  const withHours = rows.filter((r) => r.working_hours_count > 0);
  const blocked = withHours.filter((r) => r.open_future_slots > 0 && !opts.forceClearOpen);
  let eligible = withHours.filter((r) => r.open_future_slots === 0 || opts.forceClearOpen);
  if (opts.limit) eligible = eligible.slice(0, opts.limit);

  log(`Pros non migrées, actives : ${rows.length}`);
  log(`  avec working_hours configurés : ${withHours.length}`);
  log(`  exclues (slots ouverts à venir, sans --force-clear-open) : ${blocked.length}` +
    (blocked.length ? ` → ${blocked.map((r) => `#${r.id}(${r.open_future_slots})`).join(", ")}` : ""));
  log(`  éligibles maintenant : ${eligible.length}${opts.limit ? ` (limité à ${opts.limit})` : ""}`);

  const result: MigrateResult = {
    scanned: rows.length,
    withHours: withHours.length,
    blockedByOpenSlots: blocked.map((r) => r.id),
    migrated: [],
    failed: [],
  };

  if (opts.dryRun) {
    for (const r of eligible) {
      log(`[dry-run] pro #${r.id} <${r.email}> — working_hours=${r.working_hours_count}, slots=${r.total_slots}, ` +
        `ouverts à supprimer=${opts.forceClearOpen ? r.open_future_slots : 0}`);
    }
    return result;
  }

  if (eligible.length === 0) return result;

  fs.mkdirSync(snapshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const r of eligible) {
    try {
      const [slotRows] = (await db.query(
        `SELECT id, start_datetime, end_datetime, duration, status, created_at
         FROM slots WHERE pro_id = ? ORDER BY start_datetime`,
        [r.id]
      )) as [Record<string, unknown>[], unknown];

      const snapshotPath = safeJoin(snapshotDir, `${stamp}-pro-${r.id}.json`);
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            pro_id: r.id,
            email: r.email,
            captured_at: new Date().toISOString(),
            working_hours_count: r.working_hours_count,
            slots: slotRows,
          },
          null,
          2
        )
      );

      // La suppression sèche des slots ouverts et la bascule du flag doivent
      // être ATOMIQUES : un crash entre les deux laisserait la pro sans slots
      // et toujours en mode legacy (invisible côté client). Même pattern
      // transactionnel que cleanup-legacy-slots.ts.
      let openDeleted = 0;
      const cx = await db.getConnection();
      try {
        await cx.beginTransaction();

        if (opts.forceClearOpen && r.open_future_slots > 0) {
          const [del] = (await cx.execute(
            `DELETE FROM slots WHERE pro_id = ? AND status = 'available' AND end_datetime > NOW() RETURNING id`,
            [r.id]
          )) as [unknown[], unknown];
          openDeleted = (del as unknown[]).length;
        }

        await cx.execute(
          `UPDATE users SET uses_availability_engine = TRUE WHERE id = ? AND uses_availability_engine = FALSE`,
          [r.id]
        );

        await cx.commit();
      } catch (err) {
        await cx.rollback().catch(() => {});
        throw err;
      } finally {
        cx.release();
      }

      result.migrated.push(r.id);
      log(`✅ pro #${r.id} <${r.email}> — snapshot ${slotRows.length} slot(s)` +
        (openDeleted ? `, ${openDeleted} ouvert(s) supprimé(s)` : ""));
    } catch (err) {
      result.failed.push(r.id);
      log(`❌ pro #${r.id} <${r.email}> — échec, flag NON basculé : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(`\n${result.migrated.length}/${eligible.length} pro(s) basculée(s).`);
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

  runMigration(getDbRuntime(), {
    dryRun: has("--dry-run"),
    forceClearOpen: has("--force-clear-open"),
    onlyProId: flagVal("--pro") ? Number(flagVal("--pro")) : undefined,
    limit: flagVal("--limit") ? Number(flagVal("--limit")) : undefined,
  })
    .then((r) => process.exit(r.failed.length === 0 ? 0 : 1))
    .catch((err) => {
      console.error("Migration script failed:", err);
      process.exit(1);
    });
}
