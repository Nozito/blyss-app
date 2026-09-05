/**
 * #34 — Onboarding client nails.
 *
 *   GET  /api/client/onboarding/status           → progression + préférences pour la reprise
 *   POST /api/client/onboarding/preferences      { styles[], city? }
 *   GET  /api/client/onboarding/recommendations  ?city= &lat= &lng= → 3 pros
 *   POST /api/client/onboarding/cta              tap « Réserver » (compteur admin)
 *   POST /api/client/onboarding/attribution      { source } — « comment tu as connu Blyss »
 *   POST /api/client/onboarding/complete
 *   POST /api/client/onboarding/skip             (reprenable)
 *
 * authMiddleware est appliqué en amont (server.ts). L'identité client vient
 * toujours du token (req.user.id), jamais du body. Le ♥ favori de l'écran recos
 * réutilise POST /api/favorites — pas de route ici.
 */

import express, { Response } from "express";
import { getDb } from "../lib/db";
import { validate, onboardingPreferencesSchema, onboardingAttributionSchema } from "../middleware/validate";
import { countOpenSlotsForPro } from "../services/availability.service";
import { log } from "../lib/logger";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

const STEP_PREFERENCES = 3;
const STEP_CTA = 6;
const STEP_DONE = 7;
const REGION_KM = 40;

async function assertClient(userId: number): Promise<boolean> {
  const [rows] = (await getDb().query("SELECT role FROM users WHERE id = ? AND is_active = TRUE", [userId])) as [
    Array<{ role?: string }>,
    unknown,
  ];
  return rows[0]?.role === "client";
}

function fail(res: Response, route: string, err: unknown): void {
  log.error(route, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
  res.status(500).json({ success: false, message: "Erreur serveur" });
}

function toStyles(styles: string[] | null | undefined, styleNails: string | null | undefined): string[] {
  if (styles?.length) return styles;
  return styleNails ? [styleNails] : [];
}

router.get("/status", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const [rows] = (await getDb().query(
      `SELECT o.current_step, o.completed_at, o.skipped_at, o.acquisition_source,
              p.style_nails, p.styles, p.city
       FROM client_onboarding o
       LEFT JOIN client_preferences p ON p.client_id = o.client_id
       WHERE o.client_id = ?`,
      [clientId]
    )) as [
      Array<{
        current_step: number;
        completed_at: string | null;
        skipped_at: string | null;
        acquisition_source: string | null;
        style_nails: string | null;
        styles: string[] | null;
        city: string | null;
      }>,
      unknown,
    ];

    const row = rows[0];
    res.json({
      success: true,
      data: {
        current_step: row?.current_step ?? 0,
        completed: !!row?.completed_at,
        completed_at: row?.completed_at ?? null,
        skipped: !!row?.skipped_at && !row?.completed_at,
        style_nails: row?.style_nails ?? null,
        styles: toStyles(row?.styles, row?.style_nails),
        city: row?.city ?? null,
        acquisition_source: row?.acquisition_source ?? null,
      },
    });
  } catch (err) {
    fail(res, "/api/client/onboarding/status", err);
  }
});

router.post("/preferences", validate(onboardingPreferencesSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    if (!(await assertClient(clientId))) {
      return res.status(403).json({ success: false, error: "client_required" });
    }
    const body = req.body as { styles?: string[]; style_nails?: string; city?: string };
    const styles = [...new Set(toStyles(body.styles, body.style_nails))];
    const primary = styles[0];
    const city = body.city?.trim() || null;
    const db = getDb();

    await db.execute(
      `INSERT INTO client_preferences (client_id, style_nails, styles, city)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (client_id) DO UPDATE
         SET style_nails = EXCLUDED.style_nails,
             styles = EXCLUDED.styles,
             city = COALESCE(EXCLUDED.city, client_preferences.city),
             updated_at = NOW()`,
      [clientId, primary, styles, city]
    );
    await db.execute(
      `INSERT INTO client_onboarding (client_id, current_step)
       VALUES (?, ?)
       ON CONFLICT (client_id) DO UPDATE
         SET current_step = GREATEST(client_onboarding.current_step, EXCLUDED.current_step)`,
      [clientId, STEP_PREFERENCES]
    );

    res.json({ success: true, data: { styles, style_nails: primary } });
  } catch (err) {
    fail(res, "/api/client/onboarding/preferences", err);
  }
});

/**
 * Reco : classement par paliers, jamais de liste vide.
 *   1. style + région   2. région   3. style   4. mieux notées
 * « Région » = ville saisie qui matche OU pro à moins de REGION_KM du point
 * géocodé (distance calculée sur le point public/approché, jamais l'adresse exacte).
 */
router.get("/recommendations", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const db = getDb();

    const [prefRows] = (await db.query("SELECT style_nails, styles, city FROM client_preferences WHERE client_id = ?", [
      clientId,
    ])) as [Array<{ style_nails: string | null; styles: string[] | null; city: string | null }>, unknown];

    const styles = toStyles(prefRows[0]?.styles, prefRows[0]?.style_nails);
    const city =
      (typeof req.query.city === "string" && req.query.city.trim()) || prefRows[0]?.city?.trim() || "";
    const lat = Number.parseFloat(String(req.query.lat));
    const lng = Number.parseFloat(String(req.query.lng));
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
    const cityLike = city ? `%${city}%` : null;

    await db
      .execute(
        `INSERT INTO client_onboarding (client_id, recommendations_viewed)
         VALUES (?, 1)
         ON CONFLICT (client_id) DO UPDATE
           SET recommendations_viewed = client_onboarding.recommendations_viewed + 1`,
        [clientId]
      )
      .catch(() => {});

    const [rows] = (await db.query(
      `WITH g AS (SELECT ?::float8 AS lat, ?::float8 AS lng),
       base AS (
         SELECT
           u.id,
           COALESCE(NULLIF(TRIM(u.activity_name), ''), TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))) AS name,
           u.city, u.profile_photo, u.banner_photo,
           EXISTS (SELECT 1 FROM working_hours wh WHERE wh.pro_id = u.id) AS has_hours,
           (? IS NOT NULL AND u.city ILIKE ?) AS city_match,
           CASE WHEN g.lat IS NOT NULL AND u.latitude IS NOT NULL THEN
             6371 * acos(LEAST(1, GREATEST(-1,
               cos(radians(g.lat)) * cos(radians(COALESCE(u.public_latitude, u.latitude))) *
               cos(radians(COALESCE(u.public_longitude, u.longitude)) - radians(g.lng)) +
               sin(radians(g.lat)) * sin(radians(COALESCE(u.public_latitude, u.latitude))))))
           END AS distance_km
         FROM users u CROSS JOIN g
         WHERE u.role = 'pro' AND u.pro_status = 'active' AND u.is_active = TRUE AND u.profile_visibility = 'public'
       ),
       agg AS (
         SELECT
           b.id, b.name, b.city, b.profile_photo, b.banner_photo, b.has_hours, b.city_match, b.distance_km,
           ROUND(COALESCE(AVG(rv.rating), 0), 1)::float AS rating,
           COUNT(DISTINCT rv.id)::int AS reviews_count,
           COUNT(DISTINCT rez.id) FILTER (
             WHERE rez.status = 'completed' AND rez.start_datetime > NOW() - INTERVAL '90 days'
           )::int AS bookings_90d,
           COALESCE(bool_or(pns.style_nails::text = ANY(?::text[])), false) AS matches_style
         FROM base b
         LEFT JOIN reviews rv       ON rv.pro_id = b.id AND rv.deleted_at IS NULL
         LEFT JOIN reservations rez ON rez.pro_id = b.id
         LEFT JOIN pro_nail_styles pns ON pns.pro_id = b.id
         GROUP BY b.id, b.name, b.city, b.profile_photo, b.banner_photo, b.has_hours, b.city_match, b.distance_km
       )
       SELECT *, (city_match OR (distance_km IS NOT NULL AND distance_km <= ${REGION_KM})) AS in_region
       FROM agg
       ORDER BY
         (matches_style AND (city_match OR (distance_km IS NOT NULL AND distance_km <= ${REGION_KM}))) DESC,
         (city_match OR (distance_km IS NOT NULL AND distance_km <= ${REGION_KM})) DESC,
         matches_style DESC,
         has_hours DESC,
         (rating * LN(reviews_count + 1)) DESC,
         bookings_90d DESC,
         distance_km ASC NULLS LAST
       LIMIT 3`,
      [hasGeo ? lat : null, hasGeo ? lng : null, cityLike, cityLike, styles]
    )) as [Array<Record<string, unknown>>, unknown];

    const scarcity = await Promise.all(
      rows.map((r) =>
        countOpenSlotsForPro(Number(r.id), { days: 7 }).catch(() => ({ today: 0, next_7_days: 0, weekend: 0 }))
      )
    );

    res.json({
      success: true,
      data: {
        style_nails: styles[0] ?? null,
        styles,
        style_filter_active: rows.some((r) => r.matches_style === true),
        recommendations: rows.map((r, i) => ({
          pro_id: r.id,
          name: r.name,
          city: r.city,
          profile_photo: r.profile_photo,
          banner_photo: r.banner_photo,
          rating: r.rating,
          reviews_count: r.reviews_count,
          bookings_90d: r.bookings_90d,
          has_availability: r.has_hours === true,
          matches_style: r.matches_style === true,
          in_region: r.in_region === true,
          distance_km: r.distance_km == null ? null : Math.round(Number(r.distance_km)),
          open_slots: {
            today: scarcity[i].today,
            this_week: scarcity[i].next_7_days,
            this_weekend: scarcity[i].weekend,
          },
        })),
      },
    });
  } catch (err) {
    fail(res, "/api/client/onboarding/recommendations", err);
  }
});

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
         SET current_step = ?, completed_at = COALESCE(client_onboarding.completed_at, NOW()), skipped_at = NULL`,
      [clientId, STEP_DONE, STEP_DONE]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, "/api/client/onboarding/complete", err);
  }
});

router.post("/cta", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    await getDb().execute(
      `INSERT INTO client_onboarding (client_id, cta_tapped, current_step)
       VALUES (?, 1, ?)
       ON CONFLICT (client_id) DO UPDATE
         SET cta_tapped = client_onboarding.cta_tapped + 1,
             current_step = GREATEST(client_onboarding.current_step, EXCLUDED.current_step)`,
      [clientId, STEP_CTA]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, "/api/client/onboarding/cta", err);
  }
});

router.post("/skip", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    if (!(await assertClient(clientId))) {
      return res.status(403).json({ success: false, error: "client_required" });
    }
    await getDb().execute(
      `INSERT INTO client_onboarding (client_id, skipped_at)
       VALUES (?, NOW())
       ON CONFLICT (client_id) DO UPDATE SET skipped_at = NOW()`,
      [clientId]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, "/api/client/onboarding/skip", err);
  }
});

router.post("/attribution", validate(onboardingAttributionSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    if (!(await assertClient(clientId))) {
      return res.status(403).json({ success: false, error: "client_required" });
    }
    const { source } = req.body as { source: string };
    await getDb().execute(
      `INSERT INTO client_onboarding (client_id, acquisition_source)
       VALUES (?, ?)
       ON CONFLICT (client_id) DO UPDATE SET acquisition_source = EXCLUDED.acquisition_source`,
      [clientId, source]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, "/api/client/onboarding/attribution", err);
  }
});

export default router;
