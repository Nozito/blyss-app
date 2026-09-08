/**
 * Routes du workflow de consentement pour le report d'un RDV.
 *
 * PATCH /api/client/reschedule-requests/:id/accept  — cliente accepte
 * PATCH /api/client/reschedule-requests/:id/decline — cliente refuse
 * GET   /api/client/reschedule-requests/:id         — cliente consulte la proposition
 *
 * SECURITY: chaque route revérifie que la proposition appartient bien à une
 * réservation du client authentifié (pas de confiance dans un id envoyé
 * par le client sans contrôle d'ownership serveur).
 */

import express, { Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { rescheduleLimiter } from "../middleware/rate-limits";
import { parseParamToInt } from "../lib/helpers";
import {
  acceptRescheduleRequest,
  declineRescheduleRequest,
  getRescheduleRequestForClient,
  RescheduleServiceError,
} from "../services/reschedule.service";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

function handleError(err: unknown, res: Response, route: string): void {
  if (err instanceof RescheduleServiceError) {
    res.status(err.status).json({ success: false, message: err.message, ...(err.code ? { error: err.code } : {}) });
    return;
  }
  console.error(`[${route}] error =`, err);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

router.get("/client/reschedule-requests/:id", rescheduleLimiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;
    if (!clientId) return res.status(401).json({ success: false, message: "Non authentifié" });
    const requestId = parseParamToInt(req.params.id);

    const request = await getRescheduleRequestForClient({ requestId, clientId });
    res.json({ success: true, request });
  } catch (err) {
    handleError(err, res, "RESCHEDULE_GET");
  }
});

router.patch("/client/reschedule-requests/:id/accept", rescheduleLimiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;
    if (!clientId) return res.status(401).json({ success: false, message: "Non authentifié" });
    const requestId = parseParamToInt(req.params.id);

    const result = await acceptRescheduleRequest({ requestId, clientId });
    res.json({ success: true, message: "Rendez-vous reporté avec succès", ...result });
  } catch (err) {
    handleError(err, res, "RESCHEDULE_ACCEPT");
  }
});

router.patch("/client/reschedule-requests/:id/decline", rescheduleLimiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;
    if (!clientId) return res.status(401).json({ success: false, message: "Non authentifié" });
    const requestId = parseParamToInt(req.params.id);

    const result = await declineRescheduleRequest({ requestId, clientId });
    res.json({ success: true, message: "Proposition refusée, rendez-vous initial inchangé", ...result });
  } catch (err) {
    handleError(err, res, "RESCHEDULE_DECLINE");
  }
});

export default router;
