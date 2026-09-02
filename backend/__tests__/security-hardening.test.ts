/**
 * Tests — durcissements sécu (issue #14)
 *   - logger.sanitize récursif + anti log-injection (L5)
 *   - safeJoin : path traversal dans les scripts de migration
 */

import { describe, it, expect, vi } from "vitest";
import path from "path";
import { safeJoin } from "../lib/safe-path";

describe("safeJoin — anti path traversal", () => {
  const base = "/tmp/snapshots";

  it("joint un nom de fichier simple", () => {
    expect(safeJoin(base, "2026-01-01-pro-7.json")).toBe(path.resolve(base, "2026-01-01-pro-7.json"));
  });

  it("rejette un remontée via ..", () => {
    expect(() => safeJoin(base, "../etc/passwd")).toThrow(/hors du répertoire/);
  });

  it("rejette un chemin absolu qui s'échappe", () => {
    expect(() => safeJoin(base, "/etc/passwd")).toThrow(/hors du répertoire/);
  });
});

describe("logger.sanitize — récursif + scrub (L5)", () => {
  it("retire les clés PII imbriquées et neutralise les sauts de ligne", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });

    const { log } = await import("../lib/logger");
    log.warn("/test", "ligne1\nFAKE forged line", {
      user: { id: 7, email: "a@b.c", nested: { phone_number: "0600000000", ok: "yes\r\ninjected" } },
      list: [{ token: "secret" }, "plain\nvalue"],
    });

    spy.mockRestore();
    const record = JSON.parse(lines[lines.length - 1]);
    expect(record.message).not.toContain("\n");
    expect(record.ctx.user.email).toBeUndefined();
    expect(record.ctx.user.nested.phone_number).toBeUndefined();
    expect(record.ctx.user.nested.ok).toBe("yes  injected");
    expect(record.ctx.list[0].token).toBeUndefined();
    expect(record.ctx.list[1]).toBe("plain value");
  });
});
