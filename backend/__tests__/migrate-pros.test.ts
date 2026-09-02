/**
 * Tests — backend/migrate-pros-to-availability-engine.ts (chantier 4.2)
 *
 * DB mockée. Vérifie l'éligibilité, --dry-run (aucune écriture), le snapshot,
 * la bascule du flag, et --force-clear-open (suppression sèche des slots ouverts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../migrate-pros-to-availability-engine";

function makeDb(scan: any[], slotsByPro: Record<number, any[]> = {}, deleteCount = 0) {
  const query = vi.fn(async (sql: string, params?: any[]) => {
    if (sql.includes("FROM users u")) return [scan, []];
    if (sql.includes("FROM slots WHERE pro_id")) return [slotsByPro[params?.[0] as number] ?? [], []];
    return [[], []];
  });

  // La bascule (DELETE slots + UPDATE flag) passe désormais par une
  // transaction dédiée via db.getConnection() — cxExecute porte donc les
  // écritures, pas le `execute` de premier niveau.
  const beginTransaction = vi.fn().mockResolvedValue(undefined);
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn();
  const cxExecute = vi.fn(async (sql: string, _params?: any[]) => {
    if (sql.startsWith("DELETE FROM slots")) {
      return [Array.from({ length: deleteCount }, (_, i) => ({ id: i })), []];
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
    execute: cxExecute,
    cxExecute,
    beginTransaction,
    commit,
    rollback,
    release,
    getConnection,
  };
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const proWithHoursNoSlots = { id: 10, email: "a@x.fr", working_hours_count: 4, open_future_slots: 0, total_slots: 3 };
const proWithHoursOpenSlots = { id: 11, email: "b@x.fr", working_hours_count: 4, open_future_slots: 5, total_slots: 12 };
const proNoHours = { id: 12, email: "c@x.fr", working_hours_count: 0, open_future_slots: 0, total_slots: 0 };

describe("runMigration — éligibilité", () => {
  it("ne bascule qu'une pro avec working_hours ET aucun slot ouvert à venir", async () => {
    const { db, execute } = makeDb([proWithHoursNoSlots, proWithHoursOpenSlots, proNoHours], {
      10: [{ id: 1, status: "booked" }, { id: 2, status: "available" }, { id: 3, status: "past" }],
    });
    const res = await runMigration(db, { snapshotDir: tmpDir, log: () => {} });

    expect(res.migrated).toEqual([10]);
    expect(res.blockedByOpenSlots).toEqual([11]);
    expect(res.withHours).toBe(2);
    // flag basculé pour #10, jamais pour #11/#12
    const updates = execute.mock.calls.filter((c) => String(c[0]).includes("uses_availability_engine = TRUE"));
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual([10]);
  });

  it("--dry-run n'écrit rien (ni fichier, ni UPDATE)", async () => {
    const { db, execute } = makeDb([proWithHoursNoSlots], { 10: [{ id: 1 }] });
    const res = await runMigration(db, { snapshotDir: tmpDir, dryRun: true, log: () => {} });

    expect(res.migrated).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
    expect(fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : []).toHaveLength(0);
  });

  it("écrit un snapshot JSON complet des slots avant de basculer", async () => {
    const slots = [{ id: 1, status: "booked", start_datetime: "x" }, { id: 2, status: "available" }];
    const { db } = makeDb([proWithHoursNoSlots], { 10: slots });
    await runMigration(db, { snapshotDir: tmpDir, log: () => {} });

    const files = fs.readdirSync(tmpDir).filter((f) => f.includes("pro-10"));
    expect(files).toHaveLength(1);
    const snap = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), "utf8"));
    expect(snap.pro_id).toBe(10);
    expect(snap.slots).toHaveLength(2);
    expect(snap.working_hours_count).toBe(4);
  });
});

describe("runMigration — --force-clear-open", () => {
  it("rend éligible une pro avec slots ouverts, les supprime après snapshot puis bascule", async () => {
    const { db, execute } = makeDb(
      [proWithHoursOpenSlots],
      { 11: [{ id: 1, status: "available" }, { id: 2, status: "available" }] },
      2 // DELETE ... RETURNING → 2 lignes
    );
    const res = await runMigration(db, { snapshotDir: tmpDir, forceClearOpen: true, log: () => {} });

    expect(res.migrated).toEqual([11]);
    expect(res.blockedByOpenSlots).toEqual([]);

    const calls = execute.mock.calls.map((c) => String(c[0]));
    const deleteIdx = calls.findIndex((s) => s.startsWith("DELETE FROM slots"));
    const updateIdx = calls.findIndex((s) => s.includes("uses_availability_engine = TRUE"));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(updateIdx); // DELETE avant UPDATE

    // snapshot écrit AVANT la suppression
    expect(fs.readdirSync(tmpDir).some((f) => f.includes("pro-11"))).toBe(true);
  });
});

describe("runMigration — atomicité de la bascule (revue sécurité M2 / issue #11)", () => {
  it("un échec de l'UPDATE flag après le DELETE slots déclenche un ROLLBACK et n'écrit pas la pro comme migrée", async () => {
    const { db, cxExecute, commit, rollback } = makeDb(
      [proWithHoursOpenSlots],
      { 11: [{ id: 1, status: "available" }] },
      1
    );
    // DELETE ok, puis UPDATE users échoue (ex. connexion coupée)
    cxExecute.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DELETE FROM slots")) return [[{ id: 0 }], []];
      if (sql.includes("uses_availability_engine = TRUE")) throw new Error("connection reset");
      return [[], []];
    });

    const res = await runMigration(db, { snapshotDir: tmpDir, forceClearOpen: true, log: () => {} });

    expect(res.migrated).toEqual([]);
    expect(res.failed).toEqual([11]);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("DELETE + UPDATE passent par une seule transaction (begin → … → commit)", async () => {
    const { db, beginTransaction, commit, release } = makeDb(
      [proWithHoursNoSlots],
      { 10: [{ id: 1 }] }
    );
    await runMigration(db, { snapshotDir: tmpDir, log: () => {} });

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("runMigration — --pro et --limit", () => {
  it("--limit borne le nombre de bascules", async () => {
    const scan = [
      { ...proWithHoursNoSlots, id: 10 },
      { ...proWithHoursNoSlots, id: 20 },
      { ...proWithHoursNoSlots, id: 30 },
    ];
    const { db } = makeDb(scan, { 10: [], 20: [], 30: [] });
    const res = await runMigration(db, { snapshotDir: tmpDir, limit: 2, log: () => {} });
    expect(res.migrated).toEqual([10, 20]);
  });
});
