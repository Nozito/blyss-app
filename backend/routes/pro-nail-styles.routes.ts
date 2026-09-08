/**
 * #34 PR 3 — Spécialités nails déclarées par la pro (taxonomie de reco).
 *
 *   GET    /api/pro/nail-styles           → { styles: string[] }
 *   PUT    /api/pro/nail-styles            { styles: string[] } → remplace tout
 *   POST   /api/pro/nail-styles            { style } → ajoute un style
 *   DELETE /api/pro/nail-styles/:style     → retire un style
 *
 * Gate /api/pro (authMiddleware + requireProAccess) appliqué en amont dans
 * server.ts. pro_id vient TOUJOURS du token (getProId), jamais du body.
 */

import express, { Response } from "express";
import { getProId } from "../lib/helpers";
import { getDb } from "../lib/db";
import { validate, proNailStyleSchema, NAIL_STYLES } from "../middleware/validate";
import { z } from "zod";
import { log } from "../lib/logger";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

const bulkSchema = z.object({
  styles: z.array(z.enum(NAIL_STYLES)).max(NAIL_STYLES.length),
});

async function listStyles(proId: number): Promise<string[]> {
  const [rows] = (await getDb().query(
    "SELECT style_nails FROM pro_nail_styles WHERE pro_id = ? ORDER BY style_nails",
    [proId]
  )) as [Array<{ style_nails: string }>, unknown];
  return rows.map((r) => r.style_nails);
}

function fail(res: Response, route: string, err: unknown): void {
  log.error(route, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

router.get("/pro/nail-styles", async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, data: { styles: await listStyles(getProId(req)) } });
  } catch (err) {
    fail(res, "/api/pro/nail-styles GET", err);
  }
});

/* Remplace l'ensemble des styles — ce que fait l'écran « Mes spécialités nails ». */
router.put("/pro/nail-styles", validate(bulkSchema), async (req: AuthenticatedRequest, res: Response) => {
  const proId = getProId(req);
  const { styles } = req.body as { styles: string[] };
  const unique = [...new Set(styles)];
  const db = getDb();
  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();
    await cx.execute("DELETE FROM pro_nail_styles WHERE pro_id = ?", [proId]);
    for (const style of unique) {
      await cx.execute(
        "INSERT INTO pro_nail_styles (pro_id, style_nails) VALUES (?, ?) ON CONFLICT DO NOTHING",
        [proId, style]
      );
    }
    await cx.commit();
  } catch (err) {
    await cx.rollback().catch(() => {});
    return fail(res, "/api/pro/nail-styles PUT", err);
  } finally {
    cx.release();
  }
  res.json({ success: true, data: { styles: [...unique].sort() } });
});

router.post("/pro/nail-styles", validate(proNailStyleSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proId = getProId(req);
    const { style } = req.body as { style: string };
    await getDb().execute(
      "INSERT INTO pro_nail_styles (pro_id, style_nails) VALUES (?, ?) ON CONFLICT DO NOTHING",
      [proId, style]
    );
    res.json({ success: true, data: { styles: await listStyles(proId) } });
  } catch (err) {
    fail(res, "/api/pro/nail-styles POST", err);
  }
});

router.delete("/pro/nail-styles/:style", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proId = getProId(req);
    const style = String(req.params.style);
    if (!(NAIL_STYLES as readonly string[]).includes(style)) {
      return res.status(400).json({ success: false, error: "invalid_style" });
    }
    await getDb().execute("DELETE FROM pro_nail_styles WHERE pro_id = ? AND style_nails = ?", [proId, style]);
    res.json({ success: true, data: { styles: await listStyles(proId) } });
  } catch (err) {
    fail(res, "/api/pro/nail-styles DELETE", err);
  }
});

export default router;
