/**
 * Horaires d'ouverture hebdomadaires de la pro (chantier 4).
 *
 *   GET /api/pro/working-hours  → { days: [{ weekday, ranges: [{ start_time, end_time }] }] }
 *   PUT /api/pro/working-hours  → remplace toutes les plages ; { migrated: boolean }
 *
 * Le gate /api/pro (authMiddleware + requireProAccess) est appliqué en amont
 * dans server.ts. pro_id vient TOUJOURS du token (getProId), jamais du body.
 */

import express, { Response } from "express";
import { getProId } from "../lib/helpers";
import { AvailabilityError, getWorkingHours, setWorkingHours } from "../services/availability.service";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

function handleError(err: unknown, res: Response, route: string): void {
  if (err instanceof AvailabilityError) {
    res.status(err.status).json({ success: false, error: err.code, message: err.message });
    return;
  }
  console.error(`[${route}] error =`, err);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

router.get("/pro/working-hours", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await getWorkingHours(getProId(req));
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, "WORKING_HOURS_GET");
  }
});

router.put("/pro/working-hours", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { days } = req.body ?? {};
    const result = await setWorkingHours(getProId(req), days);
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(err, res, "WORKING_HOURS_PUT");
  }
});

export default router;
