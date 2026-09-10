/* eslint-disable @typescript-eslint/no-explicit-any -- lignes SQL agrégées :
   les résultats pg sont typés `any` comme dans admin.routes.ts (pas de schéma
   généré). Les shapes de réponse sont décrites dans les commentaires + docs. */
/**
 * Module « Analytics / Comportement » — Phase 1 (data DB uniquement).
 *
 * Toutes les métriques sont calculées en SQL agrégé sur les tables existantes
 * (aucun event produit requis). Ce qui n'est pas calculable sans instrumentation
 * (funnel de recherche → vue profil → tunnel de résa, sessions / usage réel de
 * l'app, attribution) n'est PAS exposé ici — cf. docs/analytics-behavior-audit.md.
 *
 * Convention de réponse : { success: true, data: ... }.
 * Chaque valeur porte, quand c'est pertinent, un effectif (`n`) à côté du ratio
 * pour que le front puisse estomper un pourcentage calculé sur trop peu de monde.
 *
 * Monté sous /api/admin/analytics/v2 (auth admin héritée du montage server.ts).
 */
import express, { Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { requireAdminMiddleware } from "../middleware/requireAdmin";
import { getDb } from "../lib/db";
import { AuthenticatedRequest } from "../lib/types";
import { parseParamToInt } from "../lib/helpers";
import { resolvedMonthlyPriceSQL, PLAN_CATALOG, verifyCatalogAgainstRevenueCat } from "../lib/subscription-catalog";

const router = express.Router();
router.use(authenticateToken, requireAdminMiddleware);

// ── Fenêtre temporelle ──────────────────────────────────────────────────────
// Le wrapper getDb() convertit `?` → $1,$2 séquentiellement SANS réutiliser un
// param (cf. reference_getdb_placeholder_gotcha). Nos fenêtres de dates sont
// réutilisées 5-10x par requête → on les valide en strict YYYY-MM-DD et on les
// injecte comme littéraux `'2026-01-01'::date` (aucun risque d'injection après
// la regex). C'est le compromis le plus lisible avec ce wrapper.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Range {
  from: string;
  to: string;
  fromLit: string;
  toLit: string;
  prevFromLit: string;
  prevToLit: string;
  days: number;
}

function resolveRange(q: Record<string, unknown>): Range {
  const today = new Date();
  const defTo = today.toISOString().slice(0, 10);
  const defFrom = new Date(today.getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  const from = typeof q.from === "string" && DATE_RE.test(q.from) ? q.from : defFrom;
  const to = typeof q.to === "string" && DATE_RE.test(q.to) ? q.to : defTo;

  const fromD = new Date(from + "T00:00:00Z");
  const toD = new Date(to + "T00:00:00Z");
  const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400_000) + 1);
  const prevTo = new Date(fromD.getTime() - 86400_000).toISOString().slice(0, 10);
  const prevFrom = new Date(fromD.getTime() - days * 86400_000).toISOString().slice(0, 10);

  return {
    from,
    to,
    fromLit: `'${from}'::date`,
    toLit: `'${to}'::date`,
    prevFromLit: `'${prevFrom}'::date`,
    prevToLit: `'${prevTo}'::date`,
    days,
  };
}

// Fin de journée incluse : `< to + 1 day`.
const end = (lit: string) => `(${lit} + INTERVAL '1 day')`;

function cityClause(q: Record<string, unknown>, col: string): string {
  const city = typeof q.city === "string" ? q.city.trim() : "";
  if (!city || city.length > 80) return "";
  return ` AND LOWER(${col}) = LOWER('${city.replace(/'/g, "''")}')`;
}

function months(q: Record<string, unknown>, def = 12): number {
  return Math.min(24, Math.max(3, parseInt(String(q.months ?? def), 10) || def));
}

const pctChange = (cur: number, prev: number): number | null =>
  prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

// ════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════════════════════

/* GET /clients/kpis?from&to&city — KPI comportement clientes (transactionnel). */
router.get("/clients/kpis", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const r = resolveRange(req.query);
    const cc = cityClause(req.query, "u.city");

    const [[cur]]: any = await db.query(`
      WITH r AS (
        SELECT res.client_id, res.id, res.status, res.start_datetime, res.created_at, res.price
        FROM reservations res JOIN users u ON u.id = res.client_id
        WHERE res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}${cc}
      )
      SELECT
        (SELECT COUNT(DISTINCT client_id) FROM r) AS active_clients,
        (SELECT COUNT(*) FROM users u WHERE u.role='client' AND u.created_at >= ${r.fromLit} AND u.created_at < ${end(r.toLit)}${cc}) AS new_clients,
        (SELECT COUNT(*) FROM r) AS bookings,
        (SELECT COUNT(*) FROM r WHERE status IN ('completed')) AS completed,
        (SELECT COUNT(*) FROM r WHERE status = 'cancelled') AS cancelled,
        (SELECT COUNT(*) FROM r WHERE status = 'cancelled' AND client_id IS NOT NULL) AS cancelled_by_someone,
        (SELECT COALESCE(SUM(price),0) FROM r WHERE status IN ('completed','confirmed')) AS gmv
    `);

    const [[prev]]: any = await db.query(`
      SELECT
        (SELECT COUNT(DISTINCT res.client_id) FROM reservations res JOIN users u ON u.id=res.client_id
          WHERE res.created_at >= ${r.prevFromLit} AND res.created_at < ${end(r.prevToLit)}${cc}) AS active_clients,
        (SELECT COUNT(*) FROM users u WHERE u.role='client' AND u.created_at >= ${r.prevFromLit} AND u.created_at < ${end(r.prevToLit)}${cc}) AS new_clients,
        (SELECT COUNT(*) FROM reservations res JOIN users u ON u.id=res.client_id
          WHERE res.created_at >= ${r.prevFromLit} AND res.created_at < ${end(r.prevToLit)}${cc}) AS bookings
    `);

    // Récurrence : parmi les clientes ayant eu leur 1re résa AVANT la fenêtre,
    // combien ont rebooké au moins une fois (lifetime).
    const [[recur]]: any = await db.query(`
      WITH firsts AS (
        SELECT client_id, MIN(start_datetime) AS first_at, COUNT(*) AS total
        FROM reservations WHERE status <> 'cancelled' GROUP BY client_id
      )
      SELECT
        COUNT(*) FILTER (WHERE total >= 1) AS with_booking,
        COUNT(*) FILTER (WHERE total >= 2) AS repeat_clients,
        COALESCE(AVG(total),0) AS avg_bookings_per_client
      FROM firsts
    `);

    // Délai médian entre 1re et 2e résa + délai médian entre 2 résas consécutives.
    const [[gaps]]: any = await db.query(`
      WITH ordered AS (
        SELECT client_id, start_datetime,
          ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY start_datetime) AS rn,
          LAG(start_datetime) OVER (PARTITION BY client_id ORDER BY start_datetime) AS prev_at
        FROM reservations WHERE status <> 'cancelled'
      )
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (start_datetime - prev_at))/86400
        ) FILTER (WHERE rn = 2) AS median_days_to_second,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (start_datetime - prev_at))/86400
        ) FILTER (WHERE rn >= 2) AS median_days_between
      FROM ordered
    `);

    const withBooking = num(recur.with_booking);
    const repeatClients = num(recur.repeat_clients);

    res.json({
      success: true,
      data: {
        range: { from: r.from, to: r.to, days: r.days },
        activeClients: { value: num(cur.active_clients), change: pctChange(num(cur.active_clients), num(prev.active_clients)) },
        newClients: { value: num(cur.new_clients), change: pctChange(num(cur.new_clients), num(prev.new_clients)) },
        bookings: { value: num(cur.bookings), change: pctChange(num(cur.bookings), num(prev.bookings)) },
        completed: num(cur.completed),
        cancelled: num(cur.cancelled),
        gmv: round2(num(cur.gmv)),
        repeatBookingRate: { value: withBooking > 0 ? Math.round((repeatClients / withBooking) * 1000) / 10 : 0, n: withBooking },
        avgBookingsPerClient: round2(num(recur.avg_bookings_per_client)),
        medianDaysToSecondBooking: gaps.median_days_to_second != null ? Math.round(Number(gaps.median_days_to_second)) : null,
        medianDaysBetweenBookings: gaps.median_days_between != null ? Math.round(Number(gaps.median_days_between)) : null,
      },
    });
  } catch (e) { next(e); }
});

/* GET /clients/cohorts?months=12 — rétention par mois de 1re réservation. */
router.get("/clients/cohorts", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const m = months(req.query);

    const [rows]: any = await db.query(`
      WITH firsts AS (
        SELECT client_id, DATE_TRUNC('month', MIN(start_datetime)) AS cohort_month
        FROM reservations WHERE status <> 'cancelled'
        GROUP BY client_id
      ),
      activity AS (
        SELECT DISTINCT r.client_id, DATE_TRUNC('month', r.start_datetime) AS active_month
        FROM reservations r WHERE r.status <> 'cancelled'
      )
      SELECT
        TO_CHAR(f.cohort_month, 'YYYY-MM') AS cohort,
        COUNT(DISTINCT f.client_id) AS size,
        (EXTRACT(YEAR FROM AGE(a.active_month, f.cohort_month)) * 12
         + EXTRACT(MONTH FROM AGE(a.active_month, f.cohort_month)))::int AS month_index,
        COUNT(DISTINCT a.client_id) AS retained
      FROM firsts f
      JOIN activity a ON a.client_id = f.client_id AND a.active_month >= f.cohort_month
      WHERE f.cohort_month >= DATE_TRUNC('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${m} - 1)
      GROUP BY 1, f.cohort_month, 3
      ORDER BY f.cohort_month, 3
    `);

    const byCohort = new Map<string, { cohort: string; size: number; retention: Record<number, { retained: number; pct: number }> }>();
    for (const row of rows as any[]) {
      const c = row.cohort;
      if (!byCohort.has(c)) byCohort.set(c, { cohort: c, size: num(row.size), retention: {} });
      const entry = byCohort.get(c)!;
      const mi = num(row.month_index);
      entry.retention[mi] = { retained: num(row.retained), pct: entry.size > 0 ? Math.round((num(row.retained) / entry.size) * 1000) / 10 : 0 };
    }

    res.json({
      success: true,
      data: {
        definition: "Rétention = a effectué ≥ 1 réservation (non annulée) pendant le mois. Cohorte = mois de la 1re réservation.",
        cohorts: [...byCohort.values()],
      },
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// PROFESSIONNELLES
// ════════════════════════════════════════════════════════════════════════════

/* GET /pros/kpis?from&to&city */
router.get("/pros/kpis", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const r = resolveRange(req.query);
    const cc = cityClause(req.query, "u.city");

    const [[k]]: any = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE u.role='pro') AS total_pros,
        COUNT(*) FILTER (WHERE u.role='pro' AND u.pro_status='active') AS active_status_pros,
        COUNT(*) FILTER (WHERE u.role='pro' AND u.created_at >= ${r.fromLit} AND u.created_at < ${end(r.toLit)}) AS new_pros,
        COUNT(*) FILTER (WHERE u.role='pro' AND u.profile_visibility='public') AS published_pros,
        COUNT(*) FILTER (WHERE u.role='pro' AND EXISTS (SELECT 1 FROM prestations p WHERE p.pro_id=u.id AND p.active)) AS with_service,
        COUNT(*) FILTER (WHERE u.role='pro' AND EXISTS (SELECT 1 FROM working_hours w WHERE w.pro_id=u.id)) AS with_availability,
        COUNT(*) FILTER (WHERE u.role='pro' AND EXISTS (SELECT 1 FROM reservations res WHERE res.pro_id=u.id)) AS with_booking,
        COUNT(*) FILTER (WHERE u.role='pro' AND (SELECT COUNT(*) FROM reservations res WHERE res.pro_id=u.id) >= 5) AS with_5_bookings
      FROM users u
      WHERE u.role = 'pro' ${cc}
    `);

    // Time to first booking (inscription → 1re résa reçue), en jours.
    const [[ttfb]]: any = await db.query(`
      WITH d AS (
        SELECT u.id, EXTRACT(EPOCH FROM (MIN(res.created_at) - u.created_at))/86400 AS days
        FROM users u JOIN reservations res ON res.pro_id = u.id
        WHERE u.role='pro'
        GROUP BY u.id, u.created_at
      )
      SELECT
        COUNT(*) AS n,
        AVG(days) AS avg_days,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days) AS p25,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days) AS p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days) AS p75
      FROM d WHERE days >= 0
    `);

    // Taux de remplissage moyen sur la fenêtre (heures réservées / heures ouvrées).
    const [[fill]]: any = await db.query(`
      WITH open_hours AS (
        SELECT pro_id, SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) * (${r.days}::numeric / 7) AS hours
        FROM working_hours GROUP BY pro_id
      ),
      booked_hours AS (
        SELECT pro_id, SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime))/3600) AS hours
        FROM reservations
        WHERE status IN ('confirmed','completed')
          AND start_datetime >= ${r.fromLit} AND start_datetime < ${end(r.toLit)}
        GROUP BY pro_id
      )
      SELECT AVG(LEAST(1, COALESCE(b.hours,0) / NULLIF(o.hours,0))) AS avg_fill
      FROM open_hours o LEFT JOIN booked_hours b ON b.pro_id = o.pro_id
    `);

    res.json({
      success: true,
      data: {
        range: { from: r.from, to: r.to, days: r.days },
        totalPros: num(k.total_pros),
        activeStatusPros: num(k.active_status_pros),
        newPros: num(k.new_pros),
        funnelCounts: {
          published: num(k.published_pros),
          withService: num(k.with_service),
          withAvailability: num(k.with_availability),
          withBooking: num(k.with_booking),
          with5Bookings: num(k.with_5_bookings),
        },
        timeToFirstBooking: {
          n: num(ttfb.n),
          avgDays: ttfb.avg_days != null ? round2(Number(ttfb.avg_days)) : null,
          p25: ttfb.p25 != null ? round2(Number(ttfb.p25)) : null,
          median: ttfb.p50 != null ? round2(Number(ttfb.p50)) : null,
          p75: ttfb.p75 != null ? round2(Number(ttfb.p75)) : null,
        },
        avgFillRate: fill.avg_fill != null ? Math.round(Number(fill.avg_fill) * 1000) / 10 : null,
      },
    });
  } catch (e) { next(e); }
});

/* GET /pros/activity?from&to&city&limit&offset&sort — tableau d'activité par pro. */
router.get("/pros/activity", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const r = resolveRange(req.query);
    const cc = cityClause(req.query, "u.city");
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
    const SORTS: Record<string, string> = {
      revenue: "revenue DESC",
      bookings: "bookings_received DESC",
      fill: "fill_rate DESC NULLS LAST",
      clients: "unique_clients DESC",
      score: "activity_score DESC",
    };
    const orderBy = SORTS[String(req.query.sort ?? "score")] ?? SORTS.score;

    const [rows]: any = await db.query(`
      WITH win AS (
        SELECT res.pro_id, res.client_id, res.status, res.price, res.start_datetime, res.end_datetime, res.created_at, res.is_no_show
        FROM reservations res
        WHERE res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}
      ),
      open_h AS (
        SELECT pro_id, SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) * (${r.days}::numeric / 7) AS hours
        FROM working_hours GROUP BY pro_id
      ),
      first_seen AS (
        SELECT pro_id, MIN(start_datetime) AS first_ever FROM reservations GROUP BY pro_id
      )
      SELECT
        u.id AS pro_id,
        COALESCE(NULLIF(TRIM(u.activity_name), ''), TRIM(u.first_name || ' ' || u.last_name)) AS pro_name,
        u.city, u.pro_status, u.profile_photo,
        COUNT(w.*) AS bookings_received,
        COUNT(w.*) FILTER (WHERE w.status IN ('confirmed','completed')) AS bookings_accepted,
        COUNT(w.*) FILTER (WHERE w.status = 'cancelled') AS bookings_cancelled,
        COUNT(w.*) FILTER (WHERE w.is_no_show) AS no_shows,
        COUNT(DISTINCT w.client_id) AS unique_clients,
        COUNT(DISTINCT w.client_id) FILTER (
          WHERE (SELECT MIN(start_datetime) FROM reservations rr WHERE rr.client_id = w.client_id AND rr.pro_id = u.id) >= ${r.fromLit}
        ) AS new_clients,
        COALESCE(SUM(w.price) FILTER (WHERE w.status IN ('confirmed','completed')), 0) AS revenue,
        ROUND((LEAST(1, COALESCE(SUM(EXTRACT(EPOCH FROM (w.end_datetime - w.start_datetime))/3600)
          FILTER (WHERE w.status IN ('confirmed','completed')), 0) / NULLIF(oh.hours, 0)) * 100)::numeric, 1) AS fill_rate,
        (SELECT COUNT(*) FROM prestations p WHERE p.pro_id = u.id AND p.active) AS active_services,
        u.last_login_at
      FROM users u
      LEFT JOIN win w ON w.pro_id = u.id
      LEFT JOIN open_h oh ON oh.pro_id = u.id
      LEFT JOIN first_seen fs ON fs.pro_id = u.id
      WHERE u.role = 'pro' ${cc}
      GROUP BY u.id, u.activity_name, u.first_name, u.last_name, u.city, u.pro_status, u.profile_photo, oh.hours, u.last_login_at
    `);

    // Score d'activité — transparent, 0..100, pondération documentée.
    //   40 % réservations reçues (plafonné à 10)
    //   25 % taux de remplissage
    //   20 % clientes uniques (plafonné à 8)
    //   15 % connexion récente (< 7 j = plein, décroissant jusqu'à 30 j)
    const now = Date.now();
    const items = (rows as any[]).map((row) => {
      const bookings = num(row.bookings_received);
      const fill = row.fill_rate == null ? 0 : Number(row.fill_rate);
      const clients = num(row.unique_clients);
      const lastLogin = row.last_login_at ? new Date(row.last_login_at).getTime() : null;
      const loginDays = lastLogin ? (now - lastLogin) / 86400_000 : 999;
      const loginScore = loginDays <= 7 ? 1 : loginDays >= 30 ? 0 : (30 - loginDays) / 23;
      const score = Math.round(
        40 * Math.min(1, bookings / 10) +
        25 * Math.min(1, fill / 100) +
        20 * Math.min(1, clients / 8) +
        15 * loginScore
      );
      return {
        proId: num(row.pro_id),
        proName: row.pro_name,
        city: row.city,
        proStatus: row.pro_status,
        profilePhoto: row.profile_photo,
        bookingsReceived: bookings,
        bookingsAccepted: num(row.bookings_accepted),
        bookingsCancelled: num(row.bookings_cancelled),
        noShows: num(row.no_shows),
        uniqueClients: clients,
        newClients: num(row.new_clients),
        revenue: round2(num(row.revenue)),
        fillRate: row.fill_rate == null ? null : Number(row.fill_rate),
        activeServices: num(row.active_services),
        activityScore: score,
      };
    });

    const sortKey = String(req.query.sort ?? "score");
    items.sort((a, b) => {
      switch (sortKey) {
        case "revenue": return b.revenue - a.revenue;
        case "bookings": return b.bookingsReceived - a.bookingsReceived;
        case "fill": return (b.fillRate ?? -1) - (a.fillRate ?? -1);
        case "clients": return b.uniqueClients - a.uniqueClients;
        default: return b.activityScore - a.activityScore;
      }
    });

    res.json({
      success: true,
      data: {
        range: { from: r.from, to: r.to, days: r.days },
        total: items.length,
        items: items.slice(offset, offset + limit),
        scoreFormula: "40% réservations (max 10) + 25% taux remplissage + 20% clientes uniques (max 8) + 15% connexion <7j",
        _orderBy: orderBy,
      },
    });
  } catch (e) { next(e); }
});

/* GET /pros/cohorts?months=12 — rétention par mois d'inscription (pro encore actif). */
router.get("/pros/cohorts", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const m = months(req.query);
    const [rows]: any = await db.query(`
      WITH cohort AS (
        SELECT id, DATE_TRUNC('month', created_at) AS cohort_month
        FROM users WHERE role='pro'
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${m} - 1)
      ),
      activity AS (
        SELECT DISTINCT pro_id, DATE_TRUNC('month', start_datetime) AS active_month
        FROM reservations WHERE status <> 'cancelled'
      )
      SELECT
        TO_CHAR(c.cohort_month, 'YYYY-MM') AS cohort,
        COUNT(DISTINCT c.id) AS size,
        (EXTRACT(YEAR FROM AGE(a.active_month, c.cohort_month)) * 12
         + EXTRACT(MONTH FROM AGE(a.active_month, c.cohort_month)))::int AS month_index,
        COUNT(DISTINCT a.pro_id) AS retained
      FROM cohort c
      JOIN activity a ON a.pro_id = c.id AND a.active_month >= c.cohort_month
      GROUP BY 1, c.cohort_month, 3
      ORDER BY c.cohort_month, 3
    `);
    const byCohort = new Map<string, any>();
    for (const row of rows as any[]) {
      const c = row.cohort;
      if (!byCohort.has(c)) byCohort.set(c, { cohort: c, size: num(row.size), retention: {} });
      const e = byCohort.get(c);
      e.retention[num(row.month_index)] = {
        retained: num(row.retained),
        pct: e.size > 0 ? Math.round((num(row.retained) / e.size) * 1000) / 10 : 0,
      };
    }
    res.json({
      success: true,
      data: {
        definition: "Rétention = la pro a reçu ≥ 1 réservation (non annulée) ce mois-là. Cohorte = mois d'inscription.",
        cohorts: [...byCohort.values()],
      },
    });
  } catch (e) { next(e); }
});

/* GET /pros/services?from&to — analyse des prestations. */
router.get("/pros/services", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const r = resolveRange(req.query);
    const [rows]: any = await db.query(`
      SELECT
        p.id, p.name, p.price, p.duration_minutes,
        COUNT(res.*) FILTER (WHERE res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}) AS bookings,
        COUNT(res.*) FILTER (WHERE res.status='cancelled' AND res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}) AS cancelled,
        COALESCE(SUM(res.price) FILTER (WHERE res.status IN ('confirmed','completed') AND res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}), 0) AS revenue,
        COUNT(DISTINCT res.client_id) FILTER (WHERE res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}) AS unique_clients
      FROM prestations p
      LEFT JOIN reservations res ON res.prestation_id = p.id
      GROUP BY p.id, p.name, p.price, p.duration_minutes
      HAVING COUNT(res.*) FILTER (WHERE res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}) > 0
      ORDER BY revenue DESC
      LIMIT 100
    `);
    res.json({
      success: true,
      data: {
        range: { from: r.from, to: r.to },
        note: "« Vues » et « conversion vue → réservation » nécessitent un event service_viewed (non disponible).",
        items: (rows as any[]).map((row) => ({
          id: num(row.id),
          name: row.name,
          price: round2(num(row.price)),
          durationMinutes: num(row.duration_minutes),
          bookings: num(row.bookings),
          cancelled: num(row.cancelled),
          revenue: round2(num(row.revenue)),
          uniqueClients: num(row.unique_clients),
        })),
      },
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// MARKETPLACE — offre / demande
// ════════════════════════════════════════════════════════════════════════════

/* GET /marketplace?from&to */
router.get("/marketplace", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const r = resolveRange(req.query);

    const [[global]]: any = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role='pro' AND pro_status='active') AS active_pros,
        (SELECT COUNT(*) FROM users WHERE role='pro' AND pro_status='active' AND profile_visibility='public'
           AND EXISTS (SELECT 1 FROM prestations p WHERE p.pro_id=users.id AND p.active)
           AND EXISTS (SELECT 1 FROM working_hours w WHERE w.pro_id=users.id)) AS bookable_pros,
        (SELECT COUNT(*) FROM prestations WHERE active) AS active_services,
        (SELECT COUNT(*) FROM users WHERE role='client') AS total_clients,
        (SELECT COUNT(DISTINCT client_id) FROM reservations WHERE created_at >= ${r.fromLit} AND created_at < ${end(r.toLit)}) AS active_clients,
        (SELECT COUNT(*) FROM reservations WHERE created_at >= ${r.fromLit} AND created_at < ${end(r.toLit)}) AS bookings,
        (SELECT COUNT(*) FROM users u WHERE u.role='pro'
           AND EXISTS (SELECT 1 FROM reservations res WHERE res.pro_id=u.id)) AS pros_with_booking,
        (SELECT COUNT(*) FROM users u WHERE u.role='client'
           AND EXISTS (SELECT 1 FROM reservations res WHERE res.client_id=u.id AND res.status<>'cancelled')) AS clients_with_booking,
        (SELECT COUNT(*) FROM users WHERE role='pro') AS total_pros
    `);

    // Offre vs demande par ville. Demande = clientes déclarant vouloir cette ville
    // (client_preferences) + liste d'attente. Offre = pros publiables dans la ville.
    const [cities]: any = await db.query(`
      WITH demand AS (
        SELECT LOWER(TRIM(city)) AS city, COUNT(*) AS want
        FROM client_preferences WHERE city IS NOT NULL AND TRIM(city) <> '' GROUP BY 1
      ),
      supply AS (
        SELECT LOWER(TRIM(city)) AS city, COUNT(*) AS pros
        FROM users WHERE role='pro' AND pro_status='active' AND city IS NOT NULL AND TRIM(city) <> '' GROUP BY 1
      ),
      bookings_city AS (
        SELECT LOWER(TRIM(u.city)) AS city, COUNT(*) AS bookings
        FROM reservations res JOIN users u ON u.id = res.pro_id
        WHERE u.city IS NOT NULL AND res.created_at >= ${r.fromLit} AND res.created_at < ${end(r.toLit)}
        GROUP BY 1
      )
      SELECT
        COALESCE(d.city, s.city) AS city,
        COALESCE(s.pros, 0) AS pros,
        COALESCE(d.want, 0) AS demand,
        COALESCE(b.bookings, 0) AS bookings
      FROM demand d
      FULL OUTER JOIN supply s ON s.city = d.city
      LEFT JOIN bookings_city b ON b.city = COALESCE(d.city, s.city)
      ORDER BY COALESCE(d.want, 0) DESC, COALESCE(s.pros, 0) DESC
      LIMIT 50
    `);

    const prosWithBooking = num(global.pros_with_booking);
    const totalPros = num(global.total_pros);
    const clientsWithBooking = num(global.clients_with_booking);
    const totalClients = num(global.total_clients);

    res.json({
      success: true,
      data: {
        range: { from: r.from, to: r.to },
        supply: {
          activePros: num(global.active_pros),
          bookablePros: num(global.bookable_pros),
          activeServices: num(global.active_services),
        },
        demand: {
          totalClients,
          activeClients: num(global.active_clients),
          bookings: num(global.bookings),
        },
        matching: {
          prosWithBookingRate: { value: totalPros > 0 ? Math.round((prosWithBooking / totalPros) * 1000) / 10 : 0, n: totalPros },
          clientsWithBookingRate: { value: totalClients > 0 ? Math.round((clientsWithBooking / totalClients) * 1000) / 10 : 0, n: totalClients },
          supplyDemandRatio: num(global.active_clients) > 0 ? round2(num(global.bookable_pros) / num(global.active_clients)) : null,
        },
        byCity: (cities as any[]).map((c) => ({
          city: c.city,
          pros: num(c.pros),
          demand: num(c.demand),
          bookings: num(c.bookings),
          gap: num(c.demand) - num(c.pros),
        })),
        notes: "Demande par ville = clientes déclarant vouloir cette ville (onboarding) — approximation, pas des recherches réelles.",
      },
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// SEGMENTS
// ════════════════════════════════════════════════════════════════════════════

/* GET /segments — segmentation clientes + pros, avec moyennes comportementales.
 * Règles documentées ici et dans docs/analytics-behavior-audit.md. */
router.get("/segments", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const [clientRows]: any = await db.query(`
      WITH c AS (
        SELECT u.id, u.created_at,
          (SELECT COUNT(*) FROM reservations r WHERE r.client_id=u.id AND r.status<>'cancelled') AS bookings,
          (SELECT MAX(r.start_datetime) FROM reservations r WHERE r.client_id=u.id AND r.status<>'cancelled') AS last_booking,
          (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.client_id=u.id AND p.status='succeeded') AS spent
        FROM users u WHERE u.role='client'
      )
      SELECT
        CASE
          WHEN bookings = 0 AND created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 'new'
          WHEN bookings = 0 THEN 'never_booked'
          WHEN last_booking >= CURRENT_DATE - INTERVAL '60 days' AND bookings >= 2 THEN 'repeat_active'
          WHEN last_booking >= CURRENT_DATE - INTERVAL '60 days' THEN 'active'
          WHEN last_booking >= CURRENT_DATE - INTERVAL '180 days' THEN 'dormant'
          ELSE 'churned'
        END AS segment,
        COUNT(*) AS n,
        AVG(bookings) AS avg_bookings,
        AVG(spent) AS avg_spent,
        AVG(EXTRACT(EPOCH FROM (CURRENT_DATE - last_booking))/86400) AS avg_days_since_last
      FROM c GROUP BY 1
    `);

    const [proRows]: any = await db.query(`
      WITH p AS (
        SELECT u.id, u.created_at, u.pro_status, u.last_login_at, u.profile_visibility,
          (SELECT COUNT(*) FROM prestations pr WHERE pr.pro_id=u.id AND pr.active) AS services,
          (SELECT COUNT(*) FROM reservations r WHERE r.pro_id=u.id) AS bookings_total,
          (SELECT COUNT(*) FROM reservations r WHERE r.pro_id=u.id AND r.created_at >= CURRENT_DATE - INTERVAL '30 days') AS bookings_30d,
          (SELECT COUNT(*) FROM reservations r WHERE r.pro_id=u.id AND r.created_at >= CURRENT_DATE - INTERVAL '60 days' AND r.created_at < CURRENT_DATE - INTERVAL '30 days') AS bookings_prev30d,
          (SELECT MAX(r.created_at) FROM reservations r WHERE r.pro_id=u.id) AS last_booking,
          EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id=u.id AND s.status='active') AS has_active_sub,
          EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id=u.id AND s.status='cancelled') AS had_sub
        FROM users u WHERE u.role='pro'
      )
      SELECT
        CASE
          WHEN pro_status = 'suspended' THEN 'suspended'
          WHEN created_at >= CURRENT_DATE - INTERVAL '14 days' AND bookings_total = 0 THEN 'new'
          WHEN (profile_visibility <> 'public' OR services = 0) THEN 'onboarding'
          WHEN bookings_total = 0 THEN 'activated'
          WHEN bookings_30d >= 5 THEN 'power'
          WHEN bookings_30d >= 1 THEN 'growing'
          WHEN bookings_prev30d >= 1 AND bookings_30d = 0 THEN 'at_risk'
          WHEN last_booking < CURRENT_DATE - INTERVAL '60 days' AND NOT has_active_sub AND had_sub THEN 'churned'
          WHEN last_booking < CURRENT_DATE - INTERVAL '60 days' THEN 'dormant'
          ELSE 'growing'
        END AS segment,
        COUNT(*) AS n,
        AVG(bookings_total) AS avg_bookings_total,
        AVG(bookings_30d) AS avg_bookings_30d,
        AVG(services) AS avg_services,
        COUNT(*) FILTER (WHERE has_active_sub) AS with_active_sub
      FROM p GROUP BY 1
    `);

    res.json({
      success: true,
      data: {
        clients: {
          rules: "new: 0 résa & inscrit <30j · never_booked: 0 résa · repeat_active: ≥2 résas & résa <60j · active: résa <60j · dormant: dernière résa 60-180j · churned: dernière résa >180j",
          segments: (clientRows as any[]).map((s) => ({
            segment: s.segment, n: num(s.n),
            avgBookings: round2(num(s.avg_bookings)),
            avgSpent: round2(num(s.avg_spent)),
            avgDaysSinceLast: s.avg_days_since_last != null ? Math.round(Number(s.avg_days_since_last)) : null,
          })),
        },
        pros: {
          rules: "new: inscrit <14j & 0 résa · onboarding: profil non public ou 0 prestation · activated: prêt mais 0 résa · power: ≥5 résas/30j · growing: 1-4 résas/30j · at_risk: avait des résas le mois -1, 0 ce mois · dormant: rien depuis 60j · churned: rien depuis 60j + abo résilié · suspended: pro_status suspended",
          segments: (proRows as any[]).map((s) => ({
            segment: s.segment, n: num(s.n),
            avgBookingsTotal: round2(num(s.avg_bookings_total)),
            avgBookings30d: round2(num(s.avg_bookings_30d)),
            avgServices: round2(num(s.avg_services)),
            withActiveSub: num(s.with_active_sub),
          })),
        },
      },
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// ABONNEMENTS — approfondissement (bloc 2)
// ════════════════════════════════════════════════════════════════════════════

/* GET /subscriptions/deep?months=12 — churn par ancienneté + cohortes d'abo. */
router.get("/subscriptions/deep", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const m = months(req.query);

    // Churn par tranche d'ancienneté : pour chaque abo résilié, âge au moment
    // de la résiliation (start_date → updated_at). Approximation (pas de log
    // d'événement d'abonnement).
    const [tenureRows]: any = await db.query(`
      WITH cancelled AS (
        SELECT id, start_date, updated_at,
          EXTRACT(EPOCH FROM (updated_at - start_date::timestamp))/86400 AS age_days
        FROM subscriptions WHERE status = 'cancelled'
      )
      SELECT
        CASE
          WHEN age_days < 30 THEN '0-30j'
          WHEN age_days < 90 THEN '31-90j'
          WHEN age_days < 180 THEN '3-6 mois'
          WHEN age_days < 365 THEN '6-12 mois'
          ELSE '12 mois +'
        END AS bucket,
        COUNT(*) AS churned
      FROM cancelled GROUP BY 1
    `);

    // Base active par tranche d'ancienneté (dénominateur indicatif).
    const [activeRows]: any = await db.query(`
      SELECT
        CASE
          WHEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date))/86400 < 30 THEN '0-30j'
          WHEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date))/86400 < 90 THEN '31-90j'
          WHEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date))/86400 < 180 THEN '3-6 mois'
          WHEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date))/86400 < 365 THEN '6-12 mois'
          ELSE '12 mois +'
        END AS bucket,
        COUNT(*) AS active
      FROM subscriptions WHERE status = 'active' GROUP BY 1
    `);

    // Cohortes d'abonnement : par mois de start_date, part encore active à M+k.
    const [cohortRows]: any = await db.query(`
      WITH subs AS (
        SELECT client_id, DATE_TRUNC('month', start_date) AS cohort_month, start_date,
          CASE WHEN status = 'active' THEN CURRENT_DATE ELSE COALESCE(end_date, updated_at::date) END AS ended
        FROM subscriptions
        WHERE start_date >= DATE_TRUNC('month', CURRENT_DATE) - MAKE_INTERVAL(months => ${m} - 1)
      ),
      idx AS (
        SELECT cohort_month, generate_series(0, 12) AS k FROM subs GROUP BY cohort_month
      )
      SELECT
        TO_CHAR(s.cohort_month, 'YYYY-MM') AS cohort,
        i.k AS month_index,
        COUNT(*) AS size,
        COUNT(*) FILTER (
          WHERE (s.cohort_month + MAKE_INTERVAL(months => i.k)) <= DATE_TRUNC('month', s.ended)
        ) AS retained
      FROM subs s JOIN idx i ON i.cohort_month = s.cohort_month
      GROUP BY 1, 2, s.cohort_month
      ORDER BY s.cohort_month, i.k
    `);

    const active = new Map<string, number>();
    for (const row of activeRows as any[]) active.set(row.bucket, num(row.active));

    const byCohort = new Map<string, any>();
    for (const row of cohortRows as any[]) {
      const c = row.cohort;
      if (!byCohort.has(c)) byCohort.set(c, { cohort: c, size: 0, retention: {} });
      const e = byCohort.get(c);
      e.size = num(row.size);
      if (num(row.month_index) === 0) e.size = num(row.size);
      e.retention[num(row.month_index)] = {
        retained: num(row.retained),
        pct: num(row.size) > 0 ? Math.round((num(row.retained) / num(row.size)) * 1000) / 10 : 0,
      };
    }

    // Répartition par plateforme de facturation (App Store / Play / Stripe / offert).
    const [storeRows]: any = await db.query(`
      SELECT
        COALESCE(s.store, CASE
          WHEN s.payment_id LIKE 'rc_%' THEN 'app_store'
          WHEN s.payment_id IN ('admin_grant','admin_internal') THEN 'promotional'
          ELSE 'unknown' END) AS store,
        COUNT(*) FILTER (WHERE s.status = 'active') AS active,
        COALESCE(SUM(${resolvedMonthlyPriceSQL("s")}) FILTER (WHERE s.status = 'active'), 0) AS mrr
      FROM subscriptions s
      GROUP BY 1
      ORDER BY active DESC
    `);
    const storeActiveTotal = (storeRows as any[]).reduce((s, x) => s + num(x.active), 0);

    const BUCKETS = ["0-30j", "31-90j", "3-6 mois", "6-12 mois", "12 mois +"];
    const churnMap = new Map<string, number>();
    for (const row of tenureRows as any[]) churnMap.set(row.bucket, num(row.churned));

    res.json({
      success: true,
      data: {
        disclaimer: "Approximations : pas de log d'événement d'abonnement. Résiliation datée par updated_at. Faible volume — indicatif.",
        storeMix: {
          note: "La distinction App Store / Play Store n'est fiable que pour les abos créés après le déploiement de la colonne `store` (webhook RevenueCat). Avant : rc_* = App Store (Android non distribué).",
          items: (storeRows as any[]).map((x) => ({
            store: x.store,
            active: num(x.active),
            mrr: round2(num(x.mrr)),
            pct: storeActiveTotal > 0 ? Math.round((num(x.active) / storeActiveTotal) * 1000) / 10 : 0,
          })),
        },
        churnByTenure: BUCKETS.map((b) => {
          const churned = churnMap.get(b) ?? 0;
          const stillActive = active.get(b) ?? 0;
          const base = churned + stillActive;
          return { bucket: b, churned, active: stillActive, churnRate: base > 0 ? Math.round((churned / base) * 1000) / 10 : null };
        }),
        cohorts: [...byCohort.values()],
      },
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// USER 360 (extension) + DATA HEALTH
// ════════════════════════════════════════════════════════════════════════════

/* GET /user-360/:id — timeline d'événements reconstituée depuis les tables. */
router.get("/user-360/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = parseParamToInt(req.params.id);

    const [[u]]: any = await db.query(
      `SELECT id, role, first_name, last_name, activity_name, email, city, created_at, last_login_at, pro_status FROM users WHERE id = ?`,
      [userId]
    );
    if (!u) return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

    const isPro = u.role === "pro";
    const idCol = isPro ? "pro_id" : "client_id";

    const [events]: any = await db.query(`
      SELECT ts, kind, label, meta FROM (
        SELECT ${u.created_at ? "u.created_at" : "NULL"} AS ts, 'signup' AS kind, 'Inscription' AS label, NULL::jsonb AS meta
          FROM users u WHERE u.id = ?
        UNION ALL
        SELECT r.created_at, 'booking_' || r.status, 'Réservation ' || r.status, jsonb_build_object('reservationId', r.id, 'price', r.price)
          FROM reservations r WHERE r.${idCol} = ?
        UNION ALL
        SELECT rv.created_at, 'review', 'Avis ' || rv.rating || '★', jsonb_build_object('rating', rv.rating)
          FROM reviews rv WHERE rv.${idCol} = ?
        UNION ALL
        SELECT s.created_at, 'subscription_' || s.status, 'Abonnement ' || s.plan || ' (' || s.status || ')', jsonb_build_object('plan', s.plan)
          FROM subscriptions s WHERE s.client_id = ?
        UNION ALL
        SELECT f.created_at, 'favorite', 'Favori ajouté', jsonb_build_object('proId', f.pro_id)
          FROM favorites f WHERE f.client_id = ?
      ) t
      WHERE ts IS NOT NULL
      ORDER BY ts DESC
      LIMIT 200
    `, [userId, userId, userId, userId, userId]);

    // Agrégats fiche.
    const [[agg]]: any = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM reservations r WHERE r.${idCol} = ? AND r.status <> 'cancelled') AS bookings,
        (SELECT COUNT(*) FROM reservations r WHERE r.${idCol} = ? AND r.status = 'cancelled') AS cancelled,
        (SELECT COUNT(DISTINCT ${isPro ? "r.client_id" : "r.pro_id"}) FROM reservations r WHERE r.${idCol} = ?) AS distinct_counterparts,
        (SELECT MIN(r.start_datetime) FROM reservations r WHERE r.${idCol} = ?) AS first_booking,
        (SELECT MAX(r.start_datetime) FROM reservations r WHERE r.${idCol} = ?) AS last_booking,
        ${isPro
          ? "(SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.pro_id = ? AND p.status='succeeded') AS money"
          : "(SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.client_id = ? AND p.status='succeeded') AS money"},
        (SELECT COUNT(*) FROM favorites f WHERE f.${isPro ? "pro_id" : "client_id"} = ?) AS favorites
    `, [userId, userId, userId, userId, userId, userId, userId]);

    res.json({
      success: true,
      data: {
        user: {
          id: num(u.id), role: u.role,
          name: u.activity_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
          email: u.email, city: u.city, createdAt: u.created_at, lastLoginAt: u.last_login_at, proStatus: u.pro_status,
        },
        stats: {
          bookings: num(agg.bookings),
          cancelled: num(agg.cancelled),
          distinctCounterparts: num(agg.distinct_counterparts),
          firstBooking: agg.first_booking,
          lastBooking: agg.last_booking,
          money: round2(num(agg.money)),
          favorites: num(agg.favorites),
        },
        timeline: (events as any[]).map((e) => ({ ts: e.ts, kind: e.kind, label: e.label, meta: e.meta })),
        note: "Timeline reconstituée depuis les tables métier. Les événements d'usage (recherches, vues de profil, sessions) ne sont pas disponibles.",
      },
    });
  } catch (e) { next(e); }
});

/* GET /data-health — quelles métriques sont réelles / calculées / indisponibles. */
router.get("/data-health", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const [[counts]]: any = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM reservations) AS reservations,
        (SELECT COUNT(*) FROM payments) AS payments,
        (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
        (SELECT COUNT(*) FROM users WHERE role='pro') AS pros,
        (SELECT COUNT(*) FROM users WHERE role='client') AS clients,
        (SELECT COUNT(*) FROM users WHERE last_login_at IS NOT NULL) AS users_with_login,
        (SELECT COUNT(*) FROM client_onboarding WHERE acquisition_source IS NOT NULL) AS clients_with_source,
        (SELECT COUNT(*) FROM reviews WHERE 1=1) AS reviews
    `);

    res.json({
      success: true,
      data: {
        volumes: {
          reservations: num(counts.reservations),
          payments: num(counts.payments),
          subscriptions: num(counts.subscriptions),
          pros: num(counts.pros),
          clients: num(counts.clients),
        },
        metrics: [
          { metric: "Réservations, GMV, annulations, no-show", status: "real", source: "reservations + payments" },
          { metric: "Cohortes clientes (rétention par mois de 1re résa)", status: "real", source: "reservations" },
          { metric: "Repeat Booking Rate, Time-to-2nd-Booking", status: "real", source: "reservations" },
          { metric: "Time-to-First-Booking pro (médiane, percentiles)", status: "real", source: "users + reservations" },
          { metric: "Activité pro, taux de remplissage, score", status: "computed", source: "reservations + working_hours (score = formule documentée)" },
          { metric: "Segments clientes / pros", status: "computed", source: "règles seuillées documentées" },
          { metric: "Clientes / pros actives sur la période", status: "estimated", source: "proxy transactionnel (a réservé / reçu une résa) — pas une mesure d'usage" },
          { metric: "Marketplace — demande par ville", status: "estimated", source: "client_preferences.city (déclaratif onboarding)", missing: ["client_search_performed"] },
          { metric: "Churn abo par ancienneté / cohortes d'abo", status: "estimated", source: `subscriptions (${num(counts.subscriptions)} lignes, résiliation datée par updated_at)`, missing: ["historisation revenuecat_events", "subscriptions.cancellation_reason"] },
          { metric: "Conversion vue profil → réservation", status: "unavailable", missing: ["pro_profile_viewed"] },
          { metric: "Sessions & jours actifs (usage réel de l'app)", status: "unavailable", missing: ["events d'app opened + reconstruction de session"] },
          { metric: "CAC / LTV par canal d'acquisition", status: "unavailable", missing: ["attribution technique ou déclarative pro", "table marketing_spend"] },
          { metric: "Filtre iOS / Android / version app", status: "unavailable", missing: ["users.signup_platform", "users.signup_app_version"] },
          { metric: "Motif de résiliation", status: "unavailable", missing: ["écran d'annulation + subscriptions.cancellation_reason"] },
        ],
        legend: {
          real: "Donnée mesurée directement.",
          computed: "Dérivée d'une formule / de règles documentées.",
          estimated: "Approximation (proxy) — à interpréter avec prudence.",
          unavailable: "Nécessite une instrumentation ou un champ absent.",
        },
      },
    });
  } catch (e) { next(e); }
});

/* GET /subscriptions/catalog — grille de prix officielle Blyss + contrôle RC. */
router.get("/subscriptions/catalog", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const warnings = await verifyCatalogAgainstRevenueCat();
    res.json({
      success: true,
      data: {
        note: "Prix officiels Blyss (App Store Connect). RevenueCat n'expose pas les prix via son API serveur — cette grille est la source de vérité, alignée sur l'offering « Blyss » et sur l'app mobile (constants/plans.ts).",
        plans: (Object.keys(PLAN_CATALOG) as (keyof typeof PLAN_CATALOG)[]).map((p) => ({
          plan: p,
          label: PLAN_CATALOG[p].label,
          monthly: PLAN_CATALOG[p].monthly,
          annual: PLAN_CATALOG[p].annual,
          annualPerMonth: Math.round((PLAN_CATALOG[p].annual / 12) * 100) / 100,
          productMonthly: PLAN_CATALOG[p].productMonthly,
          productAnnual: PLAN_CATALOG[p].productAnnual,
        })),
        revenueCatWarnings: warnings,
      },
    });
  } catch (e) { next(e); }
});

export default router;
