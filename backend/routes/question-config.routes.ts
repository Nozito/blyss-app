/**
 * Questions personnalisées d'une prestation — moteur de prestations V2.
 *
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§13.2).
 *
 *   GET/POST      /api/pro/prestations/:id/questions
 *   PATCH/DELETE  /api/pro/questions/:id
 *   POST          /api/pro/questions/:id/choices
 *   PATCH/DELETE  /api/pro/question-choices/:id
 *   POST          /api/pro/questions/detect-sensitive
 *
 * Le gate /api/pro (authMiddleware + requireProAccess) est appliqué en amont
 * dans server.ts. Même contrainte d'abonnement actif que le reste de la
 * configuration de prestation (dupliquée ici, cf. prestation-config.routes.ts).
 */

import express, { Response, NextFunction } from "express";
import { getDb } from "../lib/db";
import { getProId, parseParamToInt } from "../lib/helpers";
import {
  validate,
  questionSchema,
  questionPatchSchema,
  questionChoiceSchema,
  questionChoicePatchSchema,
  detectSensitiveSchema,
} from "../middleware/validate";
import {
  QuestionConfigError,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteOrDeactivateQuestion,
  createQuestionChoice,
  updateQuestionChoice,
  deleteQuestionChoice,
  suggestSensitive,
} from "../services/question-config.service";
import type { AuthenticatedRequest } from "../lib/types";

const db = getDb();
const router = express.Router();

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
  if (err instanceof QuestionConfigError) {
    res.status(err.status).json({ success: false, error: err.code, message: err.message });
    return;
  }
  console.error(`[${route}] error =`, err);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

router.get(
  "/pro/prestations/:id/questions",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await listQuestions(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTIONS_LIST");
    }
  }
);

router.post(
  "/pro/prestations/:id/questions",
  requireActiveProSubscription,
  validate(questionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await createQuestion(parseParamToInt(req.params.id), getProId(req), {
        label: req.body.label,
        type: req.body.type,
        required: req.body.required,
        isSensitive: req.body.is_sensitive,
        sortOrder: req.body.sort_order,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTION_CREATE");
    }
  }
);

router.patch(
  "/pro/questions/:id",
  requireActiveProSubscription,
  validate(questionPatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await updateQuestion(parseParamToInt(req.params.id), getProId(req), {
        label: req.body.label,
        type: req.body.type,
        required: req.body.required,
        isSensitive: req.body.is_sensitive,
        active: req.body.active,
        sortOrder: req.body.sort_order,
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTION_UPDATE");
    }
  }
);

router.delete(
  "/pro/questions/:id",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await deleteOrDeactivateQuestion(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTION_DELETE");
    }
  }
);

router.post(
  "/pro/questions/:id/choices",
  requireActiveProSubscription,
  validate(questionChoiceSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await createQuestionChoice(parseParamToInt(req.params.id), getProId(req), {
        label: req.body.label,
        sortOrder: req.body.sort_order,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTION_CHOICE_CREATE");
    }
  }
);

router.patch(
  "/pro/question-choices/:id",
  requireActiveProSubscription,
  validate(questionChoicePatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await updateQuestionChoice(parseParamToInt(req.params.id), getProId(req), {
        label: req.body.label,
        sortOrder: req.body.sort_order,
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, "QUESTION_CHOICE_UPDATE");
    }
  }
);

router.delete(
  "/pro/question-choices/:id",
  requireActiveProSubscription,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteQuestionChoice(parseParamToInt(req.params.id), getProId(req));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      handleError(err, res, "QUESTION_CHOICE_DELETE");
    }
  }
);

/**
 * Détection assistée par mots-clés (doc §9.2) — suggère, ne décide jamais :
 * la pro confirme/infirme explicitement `is_sensitive` en créant/modifiant
 * la question (champ du body questionSchema/questionPatchSchema).
 */
router.post(
  "/pro/questions/detect-sensitive",
  requireActiveProSubscription,
  validate(detectSensitiveSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const data = suggestSensitive(req.body.label);
    res.json({ success: true, data });
  }
);

export default router;
