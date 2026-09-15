/**
 * Configuration d'une prestation — groupes de variantes, valeurs, options.
 *
 * Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§13.1).
 *
 *   GET/POST     /api/pro/prestations/:id/variant-groups
 *   PATCH/DELETE /api/pro/variant-groups/:groupId
 *   GET/POST     /api/pro/variant-groups/:groupId/values
 *   PATCH/DELETE /api/pro/variant-values/:id
 *   GET/POST     /api/pro/prestations/:id/options
 *   PATCH/DELETE /api/pro/options/:id
 *
 * Le gate /api/pro (authMiddleware + requireProAccess) est appliqué en amont
 * dans server.ts. pro_id vient TOUJOURS du token (getProId), jamais du body.
 * Comme les routes prestations existantes, l'abonnement pro doit être actif
 * pour modifier la configuration (même contrainte business).
 */

import express, { Response, NextFunction } from "express";
import { getDb } from "../lib/db";
import { getProId, parseParamToInt } from "../lib/helpers";
import {
  validate,
  variantGroupSchema,
  variantGroupPatchSchema,
  variantValueSchema,
  variantValuePatchSchema,
  optionSchema,
  optionPatchSchema,
} from "../middleware/validate";
import {
  PrestationConfigError,
  listVariantGroups,
  createVariantGroup,
  updateVariantGroup,
  deleteOrDeactivateVariantGroup,
  createVariantValue,
  updateVariantValue,
  deleteOrDeactivateVariantValue,
  listOptions,
  createOption,
  updateOption,
  deleteOrDeactivateOption,
} from "../services/prestation-config.service";
import type { AuthenticatedRequest } from "../lib/types";

const db = getDb();
const router = express.Router();

// Même contrainte business que le CRUD prestations existant (server.ts) —
// dupliquée ici plutôt que partagée pour ne pas créer un import circulaire
// avec server.ts (qui monte ce routeur).
async function requireActiveProSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: "non_authentifie" });
    return;
  }
  const [rows] = await db.query("SELECT pro_status FROM users WHERE id = ? AND role = 'pro'", [userId]);
  if ((rows as any[])[0]?.pro_status !== "active") {
    res.status(403).json({ success: false, error: "subscription_required" });
    return;
  }
  next();
}

function handleError(err: unknown, res: Response, route: string): void {
  if (err instanceof PrestationConfigError) {
    res.status(err.status).json({ success: false, error: err.code, message: err.message });
    return;
  }
  console.error(`[${route}] error =`, err);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

// ── Groupes de variantes ────────────────────────────────────────────────────

router.get(
  "/pro/prestations/:id/variant-groups",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await listVariantGroups(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_GROUPS_LIST");
    }
  }
);

router.post(
  "/pro/prestations/:id/variant-groups",
  requireActiveProSubscription,
  validate(variantGroupSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await createVariantGroup(parseParamToInt(req.params.id), getProId(req), {
        name: req.body.name,
        required: req.body.required,
        selectionMode: req.body.selection_mode,
        sortOrder: req.body.sort_order,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_GROUP_CREATE");
    }
  }
);

router.patch(
  "/pro/variant-groups/:groupId",
  requireActiveProSubscription,
  validate(variantGroupPatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await updateVariantGroup(parseParamToInt(req.params.groupId), getProId(req), {
        name: req.body.name,
        required: req.body.required,
        selectionMode: req.body.selection_mode,
        sortOrder: req.body.sort_order,
        active: req.body.active,
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_GROUP_UPDATE");
    }
  }
);

router.delete(
  "/pro/variant-groups/:groupId",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await deleteOrDeactivateVariantGroup(parseParamToInt(req.params.groupId), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_GROUP_DELETE");
    }
  }
);

// ── Valeurs de variante ──────────────────────────────────────────────────────

router.post(
  "/pro/variant-groups/:groupId/values",
  requireActiveProSubscription,
  validate(variantValueSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await createVariantValue(parseParamToInt(req.params.groupId), getProId(req), {
        label: req.body.label,
        priceDelta: req.body.price_delta,
        durationDelta: req.body.duration_delta,
        sortOrder: req.body.sort_order,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_VALUE_CREATE");
    }
  }
);

router.patch(
  "/pro/variant-values/:id",
  requireActiveProSubscription,
  validate(variantValuePatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await updateVariantValue(parseParamToInt(req.params.id), getProId(req), {
        label: req.body.label,
        priceDelta: req.body.price_delta,
        durationDelta: req.body.duration_delta,
        sortOrder: req.body.sort_order,
        active: req.body.active,
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_VALUE_UPDATE");
    }
  }
);

router.delete(
  "/pro/variant-values/:id",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await deleteOrDeactivateVariantValue(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "VARIANT_VALUE_DELETE");
    }
  }
);

// ── Options ──────────────────────────────────────────────────────────────────

router.get(
  "/pro/prestations/:id/options",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await listOptions(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "OPTIONS_LIST");
    }
  }
);

router.post(
  "/pro/prestations/:id/options",
  requireActiveProSubscription,
  validate(optionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await createOption(parseParamToInt(req.params.id), getProId(req), {
        name: req.body.name,
        priceDelta: req.body.price_delta,
        durationDelta: req.body.duration_delta,
        sortOrder: req.body.sort_order,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      handleError(err, res, "OPTION_CREATE");
    }
  }
);

router.patch(
  "/pro/options/:id",
  requireActiveProSubscription,
  validate(optionPatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await updateOption(parseParamToInt(req.params.id), getProId(req), {
        name: req.body.name,
        priceDelta: req.body.price_delta,
        durationDelta: req.body.duration_delta,
        sortOrder: req.body.sort_order,
        active: req.body.active,
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "OPTION_UPDATE");
    }
  }
);

router.delete(
  "/pro/options/:id",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await deleteOrDeactivateOption(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "OPTION_DELETE");
    }
  }
);

export default router;
