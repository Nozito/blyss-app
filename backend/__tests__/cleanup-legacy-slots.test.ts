/**
 * Tests — backend/cleanup-legacy-slots.ts (chantier 4.6b)
 *
 * DB mockée. Vérifie :
 *   - le scope (uniquement pros migrées avec slots)
 *   - --dry-run : aucune écriture (ni snapshot, ni DELETE)
 *   - --execute : snapshot + DELETE FROM slots dans une transaction
 *   - une pro dont un slot est encore lié à une réservation active est ignorée
 *     (sauf --force-booked)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCleanup } from "../cleanup-legacy-slots";

function makeDb(opts: {
  migratedWithSlots: any[];
  bookedByPro?: Record<number, any[]>;
  slotsByPro?: Record<number, any[]>;
  deleteCount?: number;
}) {
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const beginTransaction = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn();
  const cxExecute = vi.fn(async (sql: string, _params?: any[]) => {
    if (sql.startsWith("DELETE FROM slots")) {
      return [Array.from({ length: opts.deleteCount ?? 0 }, (_, i) => ({ id: i })), []];
    }
    return [[], []];
  });

  const query = vi.fn(async (sql: string, params?: any[]) => {
    if (sql.includes("FROM users u") && sql.includes("uses_availability_engine = TRUE")) {
      return [opts.migratedWithSlots, []];
    }
    if (sql.includes("FROM reservations r")) {
      return [opts.bookedByPro?.[params?.[0] as number] ?? [], []];
    }
    if (sql.includes("FROM slots WHERE pro_id")) {
      return [opts.slotsByPro?.[params?.[0] as number] ?? [], []];
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
    commit,
    rollback,
  };
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const proA = { id: 10, email: "a@x.fr", slot_count: 3, open_future: 1 };
const proB = { id: 11, email: "b@x.fr", slot_count: 8, open_future: 4 };

describe("runCleanup", () => {
  it("--dry-run n'écrit rien (ni fichier snapshot, ni DELETE)", async () => {
    const { db, cxExecute } = makeDb({
      migratedWithSlots: [proA],
      slotsByPro: { 10: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    });

    const res = await runCleanup(db, { snapshotDir: tmpDir, dryRun: true, log: () => {} });

    expect(res.cleaned).toEqual([]);
    expect(cxExecute).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("--execute : snapshot + DELETE FROM slots commité", async () => {
    const { db, cxExecute, commit } = makeDb({
      migratedWithSlots: [proA],
      slotsByPro: { 10: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      deleteCount: 3,
    });

    const res = await runCleanup(db, { snapshotDir: tmpDir, dryRun: false, log: () => {} });

    expect(res.cleaned).toEqual([10]);
    expect(res.deletedSlots).toBe(3);
    expect(cxExecute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM slots"), [10]);
    expect(commit).toHaveBeenCalledOnce();
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/cleanup-pro-10\.json$/);
  });

  it("ignore une pro dont un slot est encore lié à une réservation active", async () => {
    const { db, cxExecute } = makeDb({
      migratedWithSlots: [proA, proB],
      bookedByPro: { 11: [{ id: 99, slot_id: 42, status: "confirmed" }] },
      slotsByPro: { 10: [{ id: 1 }], 11: [{ id: 2 }] },
      deleteCount: 1,
    });

    const res = await runCleanup(db, { snapshotDir: tmpDir, dryRun: false, log: () => {} });

    expect(res.cleaned).toEqual([10]);
    expect(res.skippedBooked).toEqual([11]);
    // un seul DELETE (pour #10)
    const deletes = cxExecute.mock.calls.filter((c) => String(c[0]).includes("DELETE FROM slots"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toEqual([10]);
  });

  it("--force-booked : supprime malgré les réservations liées", async () => {
    const { db, cxExecute } = makeDb({
      migratedWithSlots: [proB],
      bookedByPro: { 11: [{ id: 99, slot_id: 42, status: "confirmed" }] },
      slotsByPro: { 11: [{ id: 2 }] },
      deleteCount: 1,
    });

    const res = await runCleanup(db, { snapshotDir: tmpDir, dryRun: false, forceBooked: true, log: () => {} });

    expect(res.cleaned).toEqual([11]);
    expect(cxExecute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM slots"), [11]);
  });

  it("--batch limite le nombre de pros traitées", async () => {
    const { db } = makeDb({
      migratedWithSlots: [proA, proB],
      slotsByPro: { 10: [{ id: 1 }], 11: [{ id: 2 }] },
      deleteCount: 1,
    });

    const res = await runCleanup(db, { snapshotDir: tmpDir, dryRun: false, batch: 1, log: () => {} });

    expect(res.cleaned).toEqual([10]);
    expect(res.scanned).toBe(2);
  });
});
