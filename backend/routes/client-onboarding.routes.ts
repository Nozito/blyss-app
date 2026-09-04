/**
 * #34 — Onboarding client nails.
 *
 *   GET  /api/client/onboarding/status           → { current_step, completed, style_nails }
 *   POST /api/client/onboarding/preferences      { style_nails } → enregistre le style
 *   GET  /api/client/onboarding/recommendations  ?city= ?lat= ?lng= → 3 pros nails
 *   POST /api/client/onboarding/complete         → fige completed_at
 *
 * Gate : authMiddleware appliqué en amont (server.ts). L'identité client vient
 * TOUJOURS du token (req.user.id), jamais du body.
 *
 * Reco v1 : preuve sociale (note, avis, RDV réalisés 90j) + rareté (RDV à venir
 * 14j) + présence d'horaires. Le style n'est PAS encore un filtre dur — la
 * table pro_nail_styles est vide tant que l'éditeur pro n'existe pas
 * (cf. docs/DESIGN_34_client-onboarding.md). Il est stocké et ré-affiché, et
 * remonte les pros correspondants dès que des lignes existent.
 */

import express, { Response } from "express";
import { getDb } from "../lib/db";
import { validate, onboardingPreferencesSchema } from "../middleware/validate";
import { log } from "../lib/logger";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

const STEP_PREFERENCES = 2;
const STEP_DONE = 5;

async function assertClient(userId: number): Promise<boolean> {
  const [rows] = (await getDb().query(
    "SELECT role FROM users WHERE id = ? AND is_active = TRUE",
    [userId]
  )) as [Array<{ role?: string }>, unknown];
  return rows[0]?.role === "client";
}

function fail(res: Response, route: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.error(route, msg, err instanceof Error ? err.stack : undefined);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

/* GET /status */
router.get("/status", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const [rows] = (await getDb().query(
      `SELECT o.current_step, o.completed_at, p.style_nails
       FROM client_onboarding o
       LEFT JOIN client_preferences p ON p.client_id = o.client_id
       WHERE o.client_id = ?`,
      [clientId]
    )) as [Array<{ current_step: number; completed_at: string | null; style_nails: string | null }>, unknown];

    const row = rows[0];
    res.json({
      success: true,
      data: {
        current_step: row?.current_step ?? 0,
        completed: !!row?.completed_at,
        completed_at: row?.completed_at ?? null,
        style_nails: row?.style_nails ?? null,
      },
    });
  } catch (err) {
    fail(res, "/api/client/onboarding/status", err);
  }
});

/* POST /preferences { style_nails } */
router.post("/preferences", validate(onboardingPreferencesSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    if (!(await assertClient(clientId))) {
      return res.status(403).json({ success: false, error: "client_required" });
    }
    const { style_nails } = req.body as { style_nails: string };
    const db = getDb();

    await db.execute(
      `INSERT INTO client_preferences (client_id, style_nails)
       VALUES (?, ?)
       ON CONFLICT (client_id) DO UPDATE SET style_nails = EXCLUDED.style_nails, updated_at = NOW()`,
      [clientId, style_nails]
    );
    await db.execute(
      `INSERT INTO client_onboarding (client_id, current_step)
       VALUES (?, ?)
       ON CONFLICT (client_id) DO UPDATE
         SET current_step = GREATEST(client_onboarding.current_step, EXCLUDED.current_step)`,
      [clientId, STEP_PREFERENCES]
    );

    res.json({ success: true, data: { style_nails } });
  } catch (err) {
    fail(res, "/api/client/onboarding/preferences", err);
  }
});

/* GET /recommendations ?city= ?lat= ?lng= */
router.get("/recommendations", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";

    const db = getDb();
    const [prefRows] = (await db.query(
      "SELECT style_nails FROM client_preferences WHERE client_id = ?",
      [clientId]
    )) as [Array<{ style_nails: string }>, unknown];
    const style = prefRows[0]?.style_nails ?? null;

    const params: unknown[] = [style];
    let cityClause = "";
    if (city) {
      cityClause = "AND u.city ILIKE ?";
      params.push(`%${city}%`);
    }

    const [rows] = (await db.query(
      `SELECT
         u.id,
         COALESCE(NULLIF(TRIM(u.activity_name), ''), TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''))) AS name,
         u.city,
         u.profile_photo,
         u.banner_photo,
         ROUND(COALESCE(AVG(rv.rating), 0), 1)::float AS rating,
         COUNT(DISTINCT rv.id)::int AS reviews_count,
         COUNT(DISTINCT rez.id) FILTER (
           WHERE rez.status = 'completed' AND rez.start_datetime > NOW() - INTERVAL '90 days'
         )::int AS bookings_90d,
         COUNT(DISTINCT rez.id) FILTER (
           WHERE rez.status IN ('confirmed','pending') AND rez.start_datetime BETWEEN NOW() AND NOW() + INTERVAL '14 days'
         )::int AS upcoming_14d,
         EXISTS (SELECT 1 FROM working_hours wh WHERE wh.pro_id = u.id) AS has_hours,
         COALESCE(bool_or(pns.style_nails::text = ?), false) AS matches_style
       FROM users u
       LEFT JOIN reviews rv        ON rv.pro_id = u.id AND rv.deleted_at IS NULL
       LEFT JOIN reservations rez  ON rez.pro_id = u.id
       LEFT JOIN pro_nail_styles pns ON pns.pro_id = u.id
       WHERE u.role = 'pro' AND u.pro_status = 'active' AND u.is_active = TRUE
         AND u.profile_visibility = 'public'
         ${cityClause}
       GROUP BY u.id
       ORDER BY
         matches_style DESC,
         has_hours DESC,
         (COALESCE(AVG(rv.rating), 0) * LN(COUNT(DISTINCT rv.id) + 1)) DESC,
         bookings_90d DESC
       LIMIT 3`,
      params
    )) as [Array<Record<string, unknown>>, unknown];

    res.json({
      success: true,
      data: {
        style_nails: style,
        style_matching_active: rows.some((r) => r.matches_style === true),
        recommendations: rows.map((r) => ({
          pro_id: r.id,
          name: r.name,
          city: r.city,
          profile_photo: r.profile_photo,
          banner_photo: r.banner_photo,
          rating: r.rating,
          reviews_count: r.reviews_count,
          bookings_90d: r.bookings_90d,
          upcoming_14d: r.upcoming_14d,
          has_availability: r.has_hours === true,
          matches_style: r.matches_style === true,
        })),
      },
    });
  } catch (err) {
    fail(res, "/api/client/onboarding/recommendations", err);
  }
});

/* POST /complete */
router.post("/complete", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    if (!(await assertClient(clientId))) {
      return res.status(403).json({ success: false, error: "client_required" });
    }
    await getDb().execute(
      `INSERT INTO client_onboarding (client_id, current_step, completed_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET current_step = ?, completed_at = COALESCE(client_onboarding.completed_at, NOW())`,
      [clientId, STEP_DONE, STEP_DONE]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, "/api/client/onboarding/complete", err);
  }
});

export default router;
