/**
 * Tests — backend/migrate-16-pros.ts (chantier 4.6b)
 *
 * DB mockée. Vérifie : seed des horaires par défaut pour une pro sans
 * working_hours, respect des horaires existants, --dry-run (aucune écriture),
 * snapshot avant écriture, atomicité (rollback sur échec), --clear-open-slots,
 * idempotence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigrate16, DEFAULT_WORKING_HOURS } from "../migrate-16-pros";

function makeDb(scan: any[], opts: { whByPro?: Record<number, any[]>; slotsByPro?: Record<number, any[]>; deleteCount?: number; failUpdateFor?: number } = {}) {
  const { whByPro = {}, slotsByPro = {}, deleteCount = 0, failUpdateFor } = opts;

  const query = vi.fn(async (sql: string, params?: any[]) => {
    if (sql.includes("FROM users u")) return [scan, []];
    if (sql.includes("FROM working_hours WHERE pro_id")) return [whByPro[params?.[0] as number] ?? [], []];
    if (sql.includes("FROM slots WHERE pro_id")) return [slotsByPro[params?.[0] as number] ?? [], []];
    return [[], []];
  });

  const beginTransaction = vi.fn().mockResolvedValue(undefined);
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn();
  const cxExecute = vi.fn(async (sql: string, params?: any[]) => {
    if (sql.startsWith("DELETE FROM slots")) {
      return [Array.from({ length: deleteCount }, (_, i) => ({ id: i })), []];
    }
    if (sql.includes("uses_availability_engine = TRUE")) {
      if (failUpdateFor != null && params?.[0] === failUpdateFor) throw new Error("connection reset");
      return [[{ id: params?.[0] }], []];
    }
    return [[], []];
  });
  const getConnection = vi.fn().mockResolvedValue({
    execute: cxExecute,
    query: cxExecute,
    beginTransaction,
    commit,
    rollback,
    release,
  });

  return {
    db: { query, execute: query, getConnection } as any,
    query,
    cxExecute,
    beginTransaction,
    commit,
    rollback,
    release,
  };
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate16-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const proNoHours = { id: 2, email: "camille@x.fr", working_hours_count: 0, open_future_slots: 0, total_slots: 67 };
const proWithHours = { id: 3, email: "lucas@x.fr", working_hours_count: 6, open_future_slots: 0, total_slots: 4 };
const proOpenSlots = { id: 75, email: "sophie@x.fr", working_hours_count: 0, open_future_slots: 57, total_slots: 1109 };

describe("runMigrate16 — seed + bascule", () => {
  it("seed les horaires par défaut puis bascule le flag pour une pro sans working_hours", async () => {
    const { db, cxExecute } = makeDb([proNoHours]);
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.migrated).toEqual([2]);
    expect(res.seededHours).toEqual([2]);
    expect(res.failed).toEqual([]);

    const inserts = cxExecute.mock.calls.filter((c) => String(c[0]).startsWith("INSERT INTO working_hours"));
    expect(inserts).toHaveLength(DEFAULT_WORKING_HOURS.length);
    // dimanche (0) jamais seedé
    expect(inserts.every((c) => c[1]![1] >= 1 && c[1]![1] <= 6)).toBe(true);

    const inserted = cxExecute.mock.calls.findIndex((c) => String(c[0]).startsWith("INSERT INTO working_hours"));
    const flagged = cxExecute.mock.calls.findIndex((c) => String(c[0]).includes("uses_availability_engine = TRUE"));
    expect(inserted).toBeLessThan(flagged); // seed avant bascule
  });

  it("ne réinsère pas les horaires d'une pro qui en a déjà, bascule seulement le flag", async () => {
    const { db, cxExecute } = makeDb([proWithHours], { whByPro: { 3: [{ id: 1, weekday: 1, start_time: "10:00", end_time: "18:00" }] } });
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.migrated).toEqual([3]);
    expect(res.seededHours).toEqual([]);
    expect(res.skippedHadHours).toEqual([3]);
    expect(cxExecute.mock.calls.some((c) => String(c[0]).startsWith("INSERT INTO working_hours"))).toBe(false);
  });

  it("--dry-run n'écrit rien (ni fichier, ni transaction)", async () => {
    const { db, cxExecute, beginTransaction } = makeDb([proNoHours]);
    const res = await runMigrate16(db, { snapshotDir: tmpDir, dryRun: true, log: () => {} });

    expect(res.migrated).toEqual([]);
    expect(cxExecute).not.toHaveBeenCalled();
    expect(beginTransaction).not.toHaveBeenCalled();
    expect(fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : []).toHaveLength(0);
  });

  it("écrit un snapshot JSON (working_hours + slots) avant toute écriture", async () => {
    const slots = [{ id: 1, status: "booked" }, { id: 2, status: "available" }];
    const { db } = makeDb([proNoHours], { slotsByPro: { 2: slots } });
    await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    const files = fs.readdirSync(tmpDir).filter((f) => f.includes("pro-2"));
    expect(files).toHaveLength(1);
    const snap = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), "utf8"));
    expect(snap.pro_id).toBe(2);
    expect(snap.uses_availability_engine_before).toBe(false);
    expect(snap.slots).toHaveLength(2);
    expect(snap.working_hours_before).toEqual([]);
  });
});

describe("runMigrate16 — --clear-open-slots", () => {
  it("supprime les slots available futurs après snapshot, dans la même transaction", async () => {
    const { db, cxExecute } = makeDb([proOpenSlots], { deleteCount: 57 });
    const res = await runMigrate16(db, { snapshotDir: tmpDir, clearOpenSlots: true, log: () => {} });

    expect(res.migrated).toEqual([75]);
    expect(res.openSlotsDeleted).toEqual({ 75: 57 });

    const calls = cxExecute.mock.calls.map((c) => String(c[0]));
    const delIdx = calls.findIndex((s) => s.startsWith("DELETE FROM slots"));
    const flagIdx = calls.findIndex((s) => s.includes("uses_availability_engine = TRUE"));
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(delIdx).toBeLessThan(flagIdx);
  });

  it("sans --clear-open-slots, ne touche pas aux slots ouverts", async () => {
    const { db, cxExecute } = makeDb([proOpenSlots]);
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.migrated).toEqual([75]);
    expect(res.openSlotsDeleted).toEqual({});
    expect(cxExecute.mock.calls.some((c) => String(c[0]).startsWith("DELETE FROM slots"))).toBe(false);
  });
});

describe("runMigrate16 — atomicité & idempotence", () => {
  it("un échec de l'UPDATE flag déclenche un ROLLBACK, la pro n'est pas marquée migrée", async () => {
    const { db, commit, rollback } = makeDb([proNoHours], { failUpdateFor: 2 });
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.migrated).toEqual([]);
    expect(res.failed).toEqual([2]);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("un échec sur une pro n'empêche pas les suivantes", async () => {
    const { db } = makeDb([proNoHours, { ...proWithHours, id: 4 }], { failUpdateFor: 2 });
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.failed).toEqual([2]);
    expect(res.migrated).toEqual([4]);
  });

  it("relance à vide (aucune pro en FALSE) : rien à faire", async () => {
    const { db, beginTransaction } = makeDb([]);
    const res = await runMigrate16(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.scanned).toBe(0);
    expect(res.migrated).toEqual([]);
    expect(beginTransaction).not.toHaveBeenCalled();
  });

  it("--limit borne le nombre de bascules", async () => {
    const scan = [proNoHours, { ...proNoHours, id: 8 }, { ...proNoHours, id: 9 }];
    const { db } = makeDb(scan);
    const res = await runMigrate16(db, { snapshotDir: tmpDir, limit: 2, log: () => {} });
    expect(res.migrated).toEqual([2, 8]);
  });
});
