import express, { Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { authenticateToken } from "../middleware/auth";
import { requireAdminMiddleware } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import { sendNotificationToUser } from "../lib/notifications";
import { refundPaymentById } from "../lib/refunds";
import { validate } from "../middleware/validate";
import {
  adminNotificationCreateSchema,
  adminUserPatchSchema,
  adminUserCreateSchema,
  adminUserPutSchema,
  adminGrantSubscriptionSchema,
  adminBookingStatusSchema,
  adminBookingWriteSchema,
  adminCouponCreateSchema,
  adminCouponPatchSchema,
  adminCouponToggleSchema,
  adminNotificationSendSchema,
} from "../middleware/validate";

import { AuthenticatedRequest } from "../lib/types";
import { parseParamToInt } from "../lib/helpers";
import { runReminderCycle } from "../lib/reminders";

const router = express.Router();

// Nombre de conversations distinctes signalées (en tant que partie visée)
// au-delà duquel un compte est marqué "en vigilance" dans l'admin.
const REPORT_VIGILANCE_THRESHOLD = 3;

/**
 * Cancels any currently-active subscription for the user and inserts a new
 * admin_grant one (payment_id='admin_grant'), tracked by
 * cron/subscription-expiry.ts so it actually expires. Does NOT touch
 * users.pro_status — callers set that themselves.
 */
async function createAdminGrantSubscription(
  db: ReturnType<typeof getDb>,
  userId: number,
  months: number,
  plan: string = "start"
): Promise<Date> {
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + Number(months));

  await db.query(
    `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
    [userId]
  );
  await db.query(
    `INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
     VALUES (?, ?, 'monthly', 0, 0, ?, NOW(), ?, 'active', 'admin_grant')`,
    [userId, plan, months, endDate.toISOString().split("T")[0]]
  );

  return endDate;
}

// All admin routes require authentication + admin check
router.use(authenticateToken, requireAdminMiddleware);

// SECURITY: Table name derived from role — whitelisted, never interpolated from user input
const NOTIFICATION_TABLES: Record<string, string> = {
  pro:    "pro_notification_settings",
  client: "client_notification_settings",
};

/* GET /users/:userId/notification-settings */
router.get(
  "/users/:userId/notification-settings",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = parseParamToInt(req.params.userId);

      const [userRows] = await db.query(
        "SELECT role FROM users WHERE id = ?",
        [userId]
      );
      if ((userRows as any[]).length === 0) {
        return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
      }

      const role = (userRows as any[])[0].role;
      const table = NOTIFICATION_TABLES[role];
      if (!table) {
        return res.status(400).json({ success: false, message: "Rôle non supporté" });
      }

      const [settings] = await db.query(
        `SELECT * FROM ${table} WHERE user_id = ?`,
        [userId]
      );

      if ((settings as any[]).length === 0) {
        if (role === "pro") {
          await db.query(
            `INSERT INTO pro_notification_settings (user_id, new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary)
             VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
             ON CONFLICT (user_id) DO NOTHING`,
            [userId]
          );
          return res.json({ success: true, data: { user_id: userId, new_reservation: true, cancel_change: true, daily_reminder: true, client_message: true, payment_alert: true, activity_summary: true } });
        } else {
          await db.query(
            `INSERT INTO client_notification_settings (user_id, reminders, changes, messages, late, offers, email_summary)
             VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE)
             ON CONFLICT (user_id) DO NOTHING`,
            [userId]
          );
          return res.json({ success: true, data: { user_id: userId, reminders: true, changes: true, messages: true, late: true, offers: true, email_summary: false } });
        }
      }

      res.json({ success: true, data: (settings as any[])[0] });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /notifications/create */
router.post(
  "/notifications/create",
  validate(adminNotificationCreateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user_id, type, title, message, data } = req.body;

      const db = getDb();
      const [notifRows] = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, FALSE, NOW()) RETURNING id, user_id, type, title, message, data, is_read, created_at`,
        [user_id, type, title, message, data ? JSON.stringify(data) : null]
      );

      const notification = (notifRows as any[])[0];
      sendNotificationToUser(user_id, notification);

      res.json({
        success: true,
        message: "Notification créée et envoyée",
        data: { id: notification?.id },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /users */
router.get(
  "/users",
  adminLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const search = (req.query.search as string | undefined)?.trim() || null;
      const role = (req.query.role as string | undefined) || null;
      const banned = req.query.banned === "1" || req.query.banned === "true";

      const db = getDb();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (search) {
        conditions.push("(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)");
        const q = `%${search}%`;
        params.push(q, q, q);
      }
      if (role && ["pro", "client"].includes(role)) {
        conditions.push("role = ?");
        params.push(role);
      }
      if (banned) {
        conditions.push("is_active = FALSE");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM users ${where}`, params);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [users] = await db.query(`
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.phone_number, u.birth_date, u.role,
          u.is_admin, u.is_active, u.created_at, u.activity_name, u.city,
          u.instagram_account, u.profile_photo, u.banner_photo, u.pro_status, u.bio,
          COALESCE(rf.reported_count, 0) AS reported_count
        FROM users u
        LEFT JOIN (
          SELECT reported_user_id, COUNT(DISTINCT thread_id) AS reported_count
          FROM message_flags
          WHERE reported_user_id IS NOT NULL AND outcome IS DISTINCT FROM 'dismissed'
          GROUP BY reported_user_id
        ) rf ON rf.reported_user_id = u.id
        ${where}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      const usersWithVigilance = (users as any[]).map((u) => ({
        ...u,
        reported_count: Number(u.reported_count),
        is_vigilant: Number(u.reported_count) >= REPORT_VIGILANCE_THRESHOLD,
      }));

      res.json({ success: true, data: usersWithVigilance, meta: { page, limit, total } });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /users/:id — full profile + subscription history */
router.get(
  "/users/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseParamToInt(req.params.id);
      const db = getDb();

      const [userRows] = await db.query(`
        SELECT id, first_name, last_name, email, phone_number, birth_date, role,
               is_admin, is_active, created_at, activity_name, city,
               instagram_account, profile_photo, banner_photo, pro_status, bio,
               profile_visibility, is_verified
        FROM users WHERE id = ?
      `, [userId]);

      if ((userRows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Utilisateur introuvable" });
      }

      const user = (userRows as any[])[0];

      const [bookingStats] = await db.query(`
        SELECT
          COUNT(*) AS total_bookings,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed','completed')), 0) AS total_spent
        FROM reservations
        WHERE client_id = ? OR pro_id = ?
      `, [userId, userId]);

      const [subRows] = await db.query(`
        SELECT id, plan, billing_type, monthly_price, start_date, end_date, status, created_at
        FROM subscriptions WHERE client_id = ?
        ORDER BY created_at DESC LIMIT 10
      `, [userId]);

      // Historique complet des signalements — dans les deux sens, traités ou
      // non — pour permettre une décision de bannissement en un coup d'œil.
      const [reportsAgainst] = await db.query(`
        SELECT f.id, f.thread_id, f.reason_code, f.reason, f.status, f.outcome, f.created_at, f.handled_at,
               COALESCE(ru.first_name || ' ' || ru.last_name, 'Compte supprimé') AS flagged_by_name
        FROM message_flags f
        LEFT JOIN users ru ON ru.id = f.flagged_by
        WHERE f.reported_user_id = ?
        ORDER BY f.created_at DESC
      `, [userId]);

      const [reportsMade] = await db.query(`
        SELECT f.id, f.thread_id, f.reason_code, f.reason, f.status, f.outcome, f.created_at, f.handled_at,
               COALESCE(ru.first_name || ' ' || ru.last_name, 'Compte supprimé') AS reported_user_name
        FROM message_flags f
        LEFT JOIN users ru ON ru.id = f.reported_user_id
        WHERE f.flagged_by = ?
        ORDER BY f.created_at DESC
      `, [userId]);

      // Un signalement classé "pas de faute" (outcome='dismissed') n'engage
      // pas la personne visée — seuls les signalements en attente ou
      // confirmés (upheld) comptent pour la vigilance.
      const reportedCount = (reportsAgainst as any[]).filter((r) => r.outcome !== "dismissed").length;

      res.json({
        success: true,
        data: {
          ...user,
          stats: (bookingStats as any[])[0] ?? {},
          subscription_history: subRows as any[],
          reports: {
            against: reportsAgainst as any[],
            made: reportsMade as any[],
            reported_count: reportedCount,
            is_vigilant: reportedCount >= REPORT_VIGILANCE_THRESHOLD,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /users/:id — partial update (email, name, role) */
router.patch(
  "/users/:id",
  validate(adminUserPatchSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseParamToInt(req.params.id);
      const { first_name, last_name, email, role } = req.body as Record<string, string | undefined>;
      const db = getDb();

      const sets: string[] = [];
      const params: unknown[] = [];
      if (first_name) { sets.push("first_name = ?"); params.push(first_name); }
      if (last_name)  { sets.push("last_name = ?");  params.push(last_name); }
      if (email)      { sets.push("email = ?");       params.push(email); }
      if (role) { sets.push("role = ?"); params.push(role); }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: "Aucun champ à modifier" });
      }
      params.push(userId);

      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ success: true, data: { id: userId } });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /users/:id/ban */
router.post(
  "/users/:id/ban",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseParamToInt(req.params.id);
      await getDb().query("UPDATE users SET is_active = FALSE WHERE id = ?", [userId]);
      res.json({ success: true, data: { id: userId, is_active: false } });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /users/:id/unban */
router.post(
  "/users/:id/unban",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseParamToInt(req.params.id);
      await getDb().query("UPDATE users SET is_active = TRUE WHERE id = ?", [userId]);
      res.json({ success: true, data: { id: userId, is_active: true } });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /users/:id/grant-subscription */
router.post(
  "/users/:id/grant-subscription",
  validate(adminGrantSubscriptionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseParamToInt(req.params.id);
      const { plan, months } = req.body as { plan: string; months: number };

      const db = getDb();
      const endDate = await createAdminGrantSubscription(db, userId, months, plan);
      await db.query("UPDATE users SET pro_status = 'active' WHERE id = ?", [userId]);

      res.json({ success: true, data: { id: userId, plan, months, end_date: endDate } });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /dashboard/counts */
router.get(
  "/dashboard/counts",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user?.id;
      const db = getDb();

      const [totalUsersRows] = await db.query("SELECT COUNT(*) as count FROM users");
      const totalUsers = (totalUsersRows as any[])[0]?.count || 0;

      const [totalBookingsRows] = await db.query("SELECT COUNT(*) as count FROM reservations");
      const totalBookings = (totalBookingsRows as any[])[0]?.count || 0;

      let unreadNotifications = 0;
      try {
        const [unreadNotifRows] = await db.query(
          "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE",
          [adminId]
        );
        unreadNotifications = (unreadNotifRows as any[])[0]?.count || 0;
      } catch {
        // notifications table may not exist in all environments
      }

      res.json({
        success: true,
        counts: { totalUsers, totalBookings, unreadNotifications },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /dashboard/stats */
router.get(
  "/dashboard/stats",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      const calcChange = (current: number, previous: number): number | null => {
        if (previous === 0) return current > 0 ? 100 : null;
        return Math.round(((current - previous) / previous) * 100 * 10) / 10;
      };

      // ── Query 1: all main stats + month-over-month in a single CTE ──────────
      const [mainRows] = await db.query(`
        WITH
          this_month AS (SELECT DATE_TRUNC('month', CURRENT_DATE) AS d),
          last_month_start AS (SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AS d),
          uc AS (
            SELECT
              COUNT(*)                                                       AS total_users,
              COUNT(*) FILTER (WHERE role = 'pro')                          AS total_pros,
              COUNT(*) FILTER (WHERE role = 'client')                       AS total_clients,
              COUNT(*) FILTER (WHERE role = 'client' AND created_at >= (SELECT d FROM this_month))      AS clients_this,
              COUNT(*) FILTER (WHERE role = 'client' AND created_at >= (SELECT d FROM last_month_start) AND created_at < (SELECT d FROM this_month)) AS clients_last,
              COUNT(*) FILTER (WHERE role = 'pro'    AND created_at >= (SELECT d FROM this_month))      AS pros_this,
              COUNT(*) FILTER (WHERE role = 'pro'    AND created_at >= (SELECT d FROM last_month_start) AND created_at < (SELECT d FROM this_month)) AS pros_last,
              COUNT(*) FILTER (WHERE created_at >= (SELECT d FROM this_month))      AS users_this,
              COUNT(*) FILTER (WHERE created_at >= (SELECT d FROM last_month_start) AND created_at < (SELECT d FROM this_month)) AS users_last
            FROM users
          ),
          bc AS (
            SELECT
              COUNT(*)                                                                                    AS total_bookings,
              COUNT(*) FILTER (WHERE start_datetime::date = CURRENT_DATE)                               AS today_bookings,
              COUNT(*) FILTER (WHERE start_datetime::date = CURRENT_DATE - 1)                           AS yesterday_bookings,
              COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed','completed')), 0)                AS total_revenue,
              COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed','completed') AND EXTRACT(YEAR FROM start_datetime)  = EXTRACT(YEAR FROM CURRENT_DATE)                    AND EXTRACT(MONTH FROM start_datetime) = EXTRACT(MONTH FROM CURRENT_DATE)), 0)                   AS month_revenue,
              COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed','completed') AND EXTRACT(YEAR FROM start_datetime)  = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month') AND EXTRACT(MONTH FROM start_datetime) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')), 0) AS last_month_revenue
            FROM reservations
          ),
          au AS (
            SELECT COUNT(DISTINCT user_id) AS active_users
            FROM refresh_tokens
            WHERE expires_at > NOW() AND revoked = FALSE AND created_at >= NOW() - INTERVAL '7 days'
          )
        SELECT uc.*, bc.*, au.active_users FROM uc, bc, au
      `);

      const r = (mainRows as any[])[0] ?? {};
      const totalUsers    = Number(r.total_users    ?? 0);
      const totalPros     = Number(r.total_pros     ?? 0);
      const totalClients  = Number(r.total_clients  ?? 0);
      const totalBookings = Number(r.total_bookings ?? 0);
      const todayBookings = Number(r.today_bookings ?? 0);
      const totalRevenue  = Number(r.total_revenue  ?? 0);
      const monthRevenue  = Number(r.month_revenue  ?? 0);
      const activeUsers   = Number(r.active_users   ?? 0);

      const changes = {
        clients:  calcChange(Number(r.clients_this ?? 0),          Number(r.clients_last       ?? 0)),
        pros:     calcChange(Number(r.pros_this    ?? 0),          Number(r.pros_last          ?? 0)),
        users:    calcChange(Number(r.users_this   ?? 0),          Number(r.users_last         ?? 0)),
        revenue:  calcChange(monthRevenue,                          Number(r.last_month_revenue ?? 0)),
        bookings: calcChange(todayBookings,                         Number(r.yesterday_bookings ?? 0)),
      };

      // ── Query 2: bookings by status ──────────────────────────────────────────
      const [bookingStatusRows] = await db.query(
        "SELECT status, COUNT(*) as count FROM reservations GROUP BY status"
      );

      // ── Query 3: recent activity ──────────────────────────────────────────────
      const [recentActivity] = await db.query(`
        SELECT type, title, description, time FROM (
          SELECT
            'booking' AS type,
            CONCAT('Réservation de ', c.first_name, ' ', c.last_name) AS title,
            CONCAT('Chez ', p.first_name, ' ', p.last_name, ' — ', r.status) AS description,
            TO_CHAR(r.created_at, 'DD/MM HH24:MI') AS time,
            r.created_at AS ts
          FROM reservations r
          JOIN users c ON c.id = r.client_id
          JOIN users p ON p.id = r.pro_id
          UNION ALL
          SELECT
            'user' AS type,
            CONCAT('Nouvel utilisateur : ', u.first_name, ' ', u.last_name) AS title,
            CONCAT('Rôle : ', CASE WHEN u.role = 'pro' THEN 'Professionnel' ELSE 'Client' END) AS description,
            TO_CHAR(u.created_at, 'DD/MM HH24:MI') AS time,
            u.created_at AS ts
          FROM users u
        ) combined
        ORDER BY ts DESC
        LIMIT 10
      `);

      const bookingsByStatus: Record<string, number> = {};
      for (const row of (bookingStatusRows as any[])) {
        bookingsByStatus[row.status] = Number(row.count);
      }

      res.json({
        success: true,
        stats: {
          totalUsers, totalPros, totalClients, totalBookings,
          todayBookings, totalRevenue, monthRevenue, activeUsers,
          bookingsByStatus, changes,
        },
        recentActivity: (recentActivity as any[]).map((a: any) => ({
          type: a.type, title: a.title, description: a.description, time: a.time,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /users/create */
router.post(
  "/users/create",
  validate(adminUserCreateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        first_name, last_name, phone_number, email, birth_date, role, is_admin,
        activity_name, city, instagram_account, profile_photo, banner_photo,
        accept_online_payment, pro_status,
        bio, profile_visibility,
      } = req.body;

      const db = getDb();
      const [emailCheck] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
      if ((emailCheck as any).length > 0) {
        return res.status(400).json({ success: false, message: "Cet email est déjà utilisé" });
      }

      let formattedBirthDate = null;
      if (birth_date) {
        try {
          const dateObj = new Date(birth_date);
          if (!isNaN(dateObj.getTime())) {
            formattedBirthDate = dateObj.toISOString().split("T")[0];
          }
        } catch {}
      }

      const password_hash = await bcrypt.hash("TempPassword123!", 12);

      const [insertRows] = await db.query(
        `INSERT INTO users (
          first_name, last_name, phone_number, email, birth_date, password_hash,
          is_verified, role, is_admin, created_at, activity_name, city,
          instagram_account, profile_photo, banner_photo,
          accept_online_payment, pro_status, bio, profile_visibility
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          first_name, last_name, phone_number, email, formattedBirthDate, password_hash,
          0, role, is_admin ? 1 : 0,
          activity_name || null, city || null, instagram_account || null,
          profile_photo || null, banner_photo || null,
          accept_online_payment ? 1 : 0, pro_status || "inactive",
          bio || null, profile_visibility || "public",
        ]
      );

      // Setting pro_status='active' directly here (rather than through
      // /grant-subscription) would otherwise be invisible to
      // cron/subscription-expiry.ts and never expire. Give it the same
      // tracked admin_grant row so it's managed consistently.
      if (pro_status === "active") {
        const newUserId = (insertRows as any[])[0]?.id;
        await createAdminGrantSubscription(db, newUserId, 1);
      }

      res.json({ success: true, message: "Utilisateur créé avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* PUT /users/:id */
router.put(
  "/users/:id",
  validate(adminUserPutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.id;
      const {
        first_name, last_name, phone_number, email, birth_date, role, is_admin,
        activity_name, city, instagram_account, profile_photo, banner_photo,
        accept_online_payment, pro_status,
        bio, profile_visibility, is_verified,
      } = req.body;

      const db = getDb();
      const [emailCheck] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [email, userId]
      );
      if ((emailCheck as any).length > 0) {
        return res.status(400).json({ success: false, message: "Cet email est déjà utilisé" });
      }

      let formattedBirthDate = null;
      if (birth_date) {
        try {
          const dateObj = new Date(birth_date);
          if (!isNaN(dateObj.getTime())) {
            formattedBirthDate = dateObj.toISOString().split("T")[0];
          }
        } catch {}
      }

      await db.query(
        `UPDATE users SET
          first_name = ?, last_name = ?, phone_number = ?, email = ?,
          birth_date = ?, role = ?, is_admin = ?, activity_name = ?,
          city = ?, instagram_account = ?, profile_photo = ?, banner_photo = ?,
          accept_online_payment = ?, pro_status = ?, bio = ?,
          profile_visibility = ?, is_verified = ?
        WHERE id = ?`,
        [
          first_name, last_name, phone_number, email, formattedBirthDate,
          role, is_admin ? 1 : 0,
          activity_name || null, city || null, instagram_account || null,
          profile_photo || null, banner_photo || null,
          accept_online_payment ? 1 : 0, pro_status || "inactive",
          bio || null, profile_visibility || "public",
          is_verified ? 1 : 0, userId,
        ]
      );

      // Same reasoning as /users/create: pro_status='active' set here bypasses
      // /grant-subscription entirely, so give it a tracked row too — but only
      // if one doesn't already exist, so re-saving an already-active pro's
      // profile doesn't spawn a redundant admin_grant every time.
      if (pro_status === "active") {
        const [activeRows] = await db.query(
          `SELECT id FROM subscriptions WHERE client_id = ? AND status = 'active' LIMIT 1`,
          [userId]
        );
        if ((activeRows as any[]).length === 0) {
          await createAdminGrantSubscription(db, Number(userId), 1);
        }
      }

      res.json({ success: true, message: "Utilisateur modifié avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* DELETE /users/:id */
router.delete(
  "/users/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let connection;
    try {
      const db = getDb();
      const userId = parseParamToInt(req.params.id);

      const [userRows] = await db.query("SELECT is_admin FROM users WHERE id = ?", [userId]);
      const user = (userRows as any[])[0];
      if (!user) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }
      if (user.is_admin) {
        const [adminsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE");
        if ((adminsRows as any[])[0].count <= 1) {
          return res.status(400).json({
            success: false,
            message: "Impossible de supprimer le dernier administrateur",
          });
        }
      }

      // Same FK wall that blocked self-service deletion (DELETE /api/auth/delete-account):
      // reservations.pro_id, payments.client_id/pro_id, reviews.client_id/pro_id have no
      // ON DELETE CASCADE. Anonymize (accounting/legal retention for reservations+payments,
      // keep rating/comment content for reviews) before removing the row. Reviews use two
      // targeted UPDATEs rather than one with OR, so deleting this account doesn't also
      // wipe out the OTHER party's attribution on a shared row.
      connection = await db.getConnection();
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE reservations SET client_id = NULL, pro_id = NULL WHERE client_id = ? OR pro_id = ?`,
        [userId, userId]
      );
      await connection.execute(
        `UPDATE payments SET client_id = NULL, pro_id = NULL WHERE client_id = ? OR pro_id = ?`,
        [userId, userId]
      );
      await connection.execute(`UPDATE reviews SET client_id = NULL WHERE client_id = ?`, [userId]);
      await connection.execute(`UPDATE reviews SET pro_id = NULL WHERE pro_id = ?`, [userId]);
      await connection.execute(
        `UPDATE messages SET sender_id = NULL, body = NULL, attachment_url = NULL, attachment_thumbnail = NULL, deleted_at = NOW()
         WHERE sender_id = ? AND deleted_at IS NULL`,
        [userId]
      );
      await connection.execute(`UPDATE message_threads SET client_id = NULL WHERE client_id = ?`, [userId]);
      await connection.execute(`UPDATE message_threads SET pro_id = NULL WHERE pro_id = ?`, [userId]);

      await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
      await connection.commit();

      res.json({ success: true, message: "Utilisateur supprimé avec succès" });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      next(error);
    } finally {
      if (connection) connection.release();
    }
  }
);

/* PATCH /users/:id/deactivate */
router.patch(
  "/users/:id/deactivate",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.id;
      const [result] = await getDb().query(
        "UPDATE users SET is_active = FALSE WHERE id = ?",
        [userId]
      );
      if ((result as any).rowCount === 0) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }
      res.json({ success: true, message: "Compte désactivé" });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /users/:id/reactivate */
router.patch(
  "/users/:id/reactivate",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.id;
      const [result] = await getDb().query(
        "UPDATE users SET is_active = TRUE WHERE id = ?",
        [userId]
      );
      if ((result as any).rowCount === 0) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }
      res.json({ success: true, message: "Compte réactivé" });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /bookings */
router.get(
  "/bookings",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;
      const date = req.query.date as string | undefined;
      const userId = req.query.user_id as string | undefined;

      const db = getDb();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status && status !== "all") { conditions.push("r.status = ?"); params.push(status); }
      if (date) { conditions.push("r.start_datetime::date = ?"); params.push(date); }
      if (userId) { conditions.push("(r.client_id = ? OR r.pro_id = ?)"); params.push(userId, userId); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM reservations r ${where}`, params);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [bookings] = await db.query(`
        SELECT
          r.*,
          CONCAT(c.first_name, ' ', c.last_name) as client_name,
          CONCAT(p.first_name, ' ', p.last_name) as pro_name,
          pr.name as service_name
        FROM reservations r
        LEFT JOIN users c ON r.client_id = c.id
        LEFT JOIN users p ON r.pro_id = p.id
        LEFT JOIN prestations pr ON r.prestation_id = pr.id
        ${where}
        ORDER BY r.start_datetime DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      res.json({ success: true, data: bookings, meta: { page, limit, total } });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /bookings/:id */
router.get(
  "/bookings/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = parseParamToInt(req.params.id);
      const db = getDb();

      const [rows] = await db.query(`
        SELECT
          r.*,
          CONCAT(c.first_name, ' ', c.last_name) as client_name,
          c.email as client_email, c.phone_number as client_phone,
          CONCAT(p.first_name, ' ', p.last_name) as pro_name,
          p.email as pro_email,
          pr.name as service_name, pr.price as service_price, pr.duration_minutes
        FROM reservations r
        LEFT JOIN users c ON r.client_id = c.id
        LEFT JOIN users p ON r.pro_id = p.id
        LEFT JOIN prestations pr ON r.prestation_id = pr.id
        WHERE r.id = ?
      `, [bookingId]);

      if ((rows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Réservation introuvable" });
      }

      res.json({ success: true, data: (rows as any[])[0] });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /bookings/:id — status change */
router.patch(
  "/bookings/:id",
  validate(adminBookingStatusSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = parseParamToInt(req.params.id);
      const { status } = req.body as { status: string };

      await getDb().query("UPDATE reservations SET status = ? WHERE id = ?", [status, bookingId]);
      res.json({ success: true, data: { id: bookingId, status } });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /bookings/create */
router.post(
  "/bookings/create",
  validate(adminBookingWriteSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

      await getDb().query(
        `INSERT INTO reservations (client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [client_id, pro_id, prestation_id, start_datetime, end_datetime, status || "pending", price]
      );

      res.json({ success: true, message: "Réservation créée avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* PUT /bookings/:id */
router.put(
  "/bookings/:id",
  validate(adminBookingWriteSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params.id;
      const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

      await getDb().query(
        `UPDATE reservations SET
          client_id = ?, pro_id = ?, prestation_id = ?,
          start_datetime = ?, end_datetime = ?, status = ?, price = ?
        WHERE id = ?`,
        [client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price, bookingId]
      );

      res.json({ success: true, message: "Réservation modifiée avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* DELETE /bookings/:id */
router.delete(
  "/bookings/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params.id;
      const [result] = await getDb().query("DELETE FROM reservations WHERE id = ? RETURNING id", [bookingId]);

      if ((result as any[]).length === 0) {
        return res.status(404).json({ success: false, message: "Réservation non trouvée" });
      }

      res.json({ success: true, message: "Réservation supprimée avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /reminders/trigger — manual trigger for testing (dev only) */
router.post(
  "/reminders/trigger",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    try {
      await runReminderCycle();
      res.json({ success: true, message: "Reminder cycle triggered" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Payments ─────────────────────────────────────────────────────────────────

/* GET /payments */
router.get(
  "/payments",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;

      const db = getDb();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status && status !== "all") {
        conditions.push("py.status = ?");
        params.push(status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM payments py ${where}`, params);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [rows] = await db.query(`
        SELECT
          py.id, py.reservation_id, py.type, py.amount, py.status,
          py.stripe_payment_intent_id, py.created_at,
          CONCAT(c.first_name, ' ', c.last_name) as client_name,
          CONCAT(p.first_name, ' ', p.last_name) as pro_name,
          ROUND(py.amount * 0.015 + 0.25, 2) as fee,
          ROUND(py.amount - (py.amount * 0.015 + 0.25), 2) as net_amount
        FROM payments py
        LEFT JOIN users c ON py.client_id = c.id
        LEFT JOIN users p ON py.pro_id = p.id
        ${where}
        ORDER BY py.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      res.json({ success: true, data: rows, meta: { page, limit, total } });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /payments/:id */
router.get(
  "/payments/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const paymentId = parseParamToInt(req.params.id);
      const db = getDb();

      const [rows] = await db.query(`
        SELECT
          py.*, r.start_datetime, r.end_datetime, r.status as booking_status,
          CONCAT(c.first_name, ' ', c.last_name) as client_name,
          c.email as client_email,
          CONCAT(p.first_name, ' ', p.last_name) as pro_name,
          ROUND(py.amount * 0.015 + 0.25, 2) as fee,
          ROUND(py.amount - (py.amount * 0.015 + 0.25), 2) as net_amount
        FROM payments py
        LEFT JOIN reservations r ON py.reservation_id = r.id
        LEFT JOIN users c ON py.client_id = c.id
        LEFT JOIN users p ON py.pro_id = p.id
        WHERE py.id = ?
      `, [paymentId]);

      if ((rows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Paiement introuvable" });
      }

      res.json({ success: true, data: (rows as any[])[0] });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /payments/:id/refund */
router.post(
  "/payments/:id/refund",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const paymentId = parseParamToInt(req.params.id);
      const result = await refundPaymentById(paymentId);

      switch (result.status) {
        case "not_found":
          return res.status(404).json({ success: false, error: "Paiement introuvable" });
        case "already_refunded":
          return res.status(400).json({ success: false, error: "Déjà remboursé" });
        case "not_refundable":
          return res.status(400).json({
            success: false,
            error: "Ce paiement ne peut pas être remboursé (statut ou moyen de paiement invalide)",
          });
        case "refunded":
          return res.json({
            success: true,
            data: { id: paymentId, status: "refunded", stripe_refund_id: result.stripeRefundId },
          });
      }
    } catch (error) {
      next(error);
    }
  }
);

// ── Coupons ───────────────────────────────────────────────────────────────────

/* GET /coupons */
router.get(
  "/coupons",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [rows] = await getDb().query(
        "SELECT * FROM coupons ORDER BY created_at DESC"
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /coupons */
router.post(
  "/coupons",
  validate(adminCouponCreateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { code, discount_type, discount_value, applicable_plans, expires_at, max_uses } = req.body as {
        code: string;
        discount_type: "percent" | "fixed";
        discount_value: number;
        applicable_plans: string[];
        expires_at?: string;
        max_uses?: number;
      };

      const db = getDb();
      const [result] = await db.query(
        `INSERT INTO coupons (code, discount_type, discount_value, applicable_plans, expires_at, max_uses)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          code.trim().toUpperCase(),
          discount_type,
          discount_value,
          JSON.stringify(applicable_plans ?? []),
          expires_at ?? null,
          max_uses ?? null,
        ]
      );

      res.json({ success: true, data: { id: (result as any).insertId } });
    } catch (error: any) {
      if (error?.code === "23505" || error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ success: false, error: "Ce code existe déjà" });
      }
      next(error);
    }
  }
);

/* PATCH /coupons/:id */
router.patch(
  "/coupons/:id",
  validate(adminCouponPatchSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const couponId = parseParamToInt(req.params.id);
      const { code, discount_type, discount_value, applicable_plans, expires_at, max_uses } = req.body as Record<string, any>;

      const sets: string[] = [];
      const params: unknown[] = [];
      if (code) { sets.push("code = ?"); params.push(code.trim().toUpperCase()); }
      if (discount_type) { sets.push("discount_type = ?"); params.push(discount_type); }
      if (discount_value != null) { sets.push("discount_value = ?"); params.push(discount_value); }
      if (applicable_plans) { sets.push("applicable_plans = ?"); params.push(JSON.stringify(applicable_plans)); }
      if (expires_at !== undefined) { sets.push("expires_at = ?"); params.push(expires_at ?? null); }
      if (max_uses !== undefined) { sets.push("max_uses = ?"); params.push(max_uses ?? null); }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: "Aucun champ à modifier" });
      }
      params.push(couponId);

      await getDb().query(`UPDATE coupons SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ success: true, data: { id: couponId } });
    } catch (error) {
      next(error);
    }
  }
);

/* DELETE /coupons/:id */
router.delete(
  "/coupons/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const couponId = parseParamToInt(req.params.id);
      const [result] = await getDb().query("DELETE FROM coupons WHERE id = ? RETURNING id", [couponId]);

      if ((result as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Coupon introuvable" });
      }
      res.json({ success: true, data: { id: couponId } });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /coupons/:id/toggle */
router.patch(
  "/coupons/:id/toggle",
  validate(adminCouponToggleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const couponId = parseParamToInt(req.params.id);
      const { active } = req.body as { active: boolean };

      await getDb().query(
        "UPDATE coupons SET is_active = ? WHERE id = ?",
        [active ? 1 : 0, couponId]
      );
      res.json({ success: true, data: { id: couponId, is_active: !!active } });
    } catch (error) {
      next(error);
    }
  }
);

// ── Notifications (mass send) ─────────────────────────────────────────────────

/* POST /notifications/send — mass or targeted */
router.post(
  "/notifications/send",
  validate(adminNotificationSendSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { target, user_id, title, body } = req.body as {
        target: "user_id" | "all" | "pros" | "clients";
        user_id?: number;
        title: string;
        body: string;
      };

      const db = getDb();
      let userIds: number[] = [];

      if (target === "user_id") {
        if (!user_id) {
          return res.status(400).json({ success: false, error: "user_id requis pour target=user_id" });
        }
        userIds = [user_id];
      } else {
        const whereClause = target === "pros" ? "WHERE role = 'pro' AND is_active = TRUE"
          : target === "clients" ? "WHERE role = 'client' AND is_active = TRUE"
          : "WHERE is_active = TRUE";
        const sql = `SELECT id FROM users ${whereClause}`;
        console.log("[push] query:", sql);
        const [rows] = await db.query(sql);
        userIds = (rows as any[]).map((r: any) => r.id);
        console.log("[push] userIds found:", userIds.length, "target:", target);
      }

      if (userIds.length === 0) {
        console.warn("[push] No active users found for target:", target);
        return res.json({ success: true, data: { sent: 0 } });
      }

      // Insert in-app notifications
      const values = userIds.map(() => "(?, 'admin', ?, ?, FALSE, NOW())").join(", ");
      const params = userIds.flatMap((id) => [id, title.trim(), body.trim()]);
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES ${values}`,
        params
      );

      // WebSocket delivery (users with app open)
      for (const uid of userIds) {
        sendNotificationToUser(uid, { id: 0, type: "admin", title: title.trim(), message: body.trim(), created_at: new Date().toISOString() });
      }

      // Expo push delivery (APNs / FCM via Expo — background / closed app)
      let tokenRows: any[] = [];
      try {
        const [rows] = await db.query(
          `SELECT user_id, token FROM expo_push_tokens WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
          userIds
        );
        tokenRows = rows as any[];
      } catch (e: any) {
        console.warn("[push] expo_push_tokens unavailable (migration pending?):", e.message);
      }

      const isExpoPushToken = (t: string) => /^Expo(nent)?PushToken\[.+\]$/.test(t);
      const messages = tokenRows
        .filter((r) => isExpoPushToken(r.token))
        .map((r) => ({
          to: r.token as string,
          sound: "default",
          title: title.trim(),
          body: body.trim(),
          data: { type: "admin" },
        }));

      console.log("[push] expo tokens found:", messages.length, "/ userIds:", userIds.length);
      if (messages.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < messages.length; i += CHUNK) {
          const chunk = messages.slice(i, i + CHUNK);
          const r = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(chunk),
          }).catch((e: Error) => { console.error("[push] chunk", i / CHUNK, "failed:", e.message); return null; });
          if (r) console.log("[push] chunk", i / CHUNK, "status:", r.status);
        }
      }

      console.log("[push] sent:", userIds.length);
      res.json({ success: true, data: { sent: userIds.length } });
    } catch (error) {
      next(error);
    }
  }
);

// ── Analytics ─────────────────────────────────────────────────────────────────

/* GET /analytics */
router.get(
  "/analytics",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      const [revenueRows] = await db.query(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0) AS total_revenue,
          COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'
            AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)), 0) AS month_revenue,
          COUNT(*) FILTER (WHERE status = 'succeeded') AS successful_payments,
          COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_payments
        FROM payments
      `);

      const [userRows] = await db.query(`
        SELECT
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE role = 'pro') AS total_pros,
          COUNT(*) FILTER (WHERE role = 'client') AS total_clients,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS new_last_30d
        FROM users
      `);

      const [bookingRows] = await db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE start_datetime >= CURRENT_DATE - INTERVAL '30 days') AS last_30d
        FROM reservations
      `);

      res.json({
        success: true,
        data: {
          revenue: (revenueRows as any[])[0] ?? {},
          users: (userRows as any[])[0] ?? {},
          bookings: (bookingRows as any[])[0] ?? {},
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /analytics/revenue */
router.get(
  "/analytics/revenue",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const period = (req.query.period as string) || "month";
      const db = getDb();

      let interval = "INTERVAL '30 days'";
      let truncUnit = "day";
      if (period === "week") { interval = "INTERVAL '7 days'"; truncUnit = "day"; }
      else if (period === "year") { interval = "INTERVAL '365 days'"; truncUnit = "month"; }

      const [rows] = await db.query(`
        SELECT
          DATE_TRUNC('${truncUnit}', created_at) AS period,
          COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0) AS revenue,
          COUNT(*) FILTER (WHERE status = 'succeeded') AS transactions
        FROM payments
        WHERE created_at >= CURRENT_TIMESTAMP - ${interval}
        GROUP BY DATE_TRUNC('${truncUnit}', created_at)
        ORDER BY period ASC
      `);

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /analytics/users */
router.get(
  "/analytics/users",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const period = (req.query.period as string) || "month";
      const db = getDb();

      let interval = "INTERVAL '30 days'";
      let truncUnit = "day";
      if (period === "week") { interval = "INTERVAL '7 days'"; truncUnit = "day"; }
      else if (period === "year") { interval = "INTERVAL '365 days'"; truncUnit = "month"; }

      const [rows] = await db.query(`
        SELECT
          DATE_TRUNC('${truncUnit}', created_at) AS period,
          COUNT(*) AS new_users,
          COUNT(*) FILTER (WHERE role = 'pro') AS new_pros,
          COUNT(*) FILTER (WHERE role = 'client') AS new_clients
        FROM users
        WHERE created_at >= CURRENT_TIMESTAMP - ${interval}
        GROUP BY DATE_TRUNC('${truncUnit}', created_at)
        ORDER BY period ASC
      `);

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /analytics/bookings */
router.get(
  "/analytics/bookings",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const period = (req.query.period as string) || "month";
      const db = getDb();

      let interval = "INTERVAL '30 days'";
      let truncUnit = "day";
      if (period === "week") { interval = "INTERVAL '7 days'"; truncUnit = "day"; }
      else if (period === "year") { interval = "INTERVAL '365 days'"; truncUnit = "month"; }

      const [rows] = await db.query(`
        SELECT
          DATE_TRUNC('${truncUnit}', created_at) AS period,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed','completed')), 0) AS revenue
        FROM reservations
        WHERE created_at >= CURRENT_TIMESTAMP - ${interval}
        GROUP BY DATE_TRUNC('${truncUnit}', created_at)
        ORDER BY period ASC
      `);

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
);

// ── Reviews moderation ────────────────────────────────────────────────────
// Backs app/(admin-tools)/reviews.tsx, which existed with no matching
// routes at all — every call 404'd. flags_count implies several distinct
// reporters can flag the same review (review_flags join table), fed by
// POST /api/reviews/:id/flag (a pro reporting a review on her own profile).

/* GET /reviews?flagged=true — only flagged reviews are ever requested by
 * the mobile screen today, but an unfiltered browse is supported too.
 * GET /reviews?deleted=true — the "Supprimés" tab, so an admin can restore
 * a review deleted by mistake or after reconsidering. */
router.get(
  "/reviews",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const flaggedOnly = req.query.flagged === "true";
      const deletedOnly = req.query.deleted === "true";
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;
      const deletedCondition = deletedOnly ? "r.deleted_at IS NOT NULL" : "r.deleted_at IS NULL";

      const [totalRows] = await db.query(
        `SELECT COUNT(DISTINCT r.id) AS total
         FROM reviews r
         ${flaggedOnly ? "JOIN" : "LEFT JOIN"} review_flags rf ON rf.review_id = r.id
         WHERE ${deletedCondition}`,
        []
      );
      const total = Number((totalRows as any[])[0]?.total ?? 0);

      const [rows] = await db.query(
        `SELECT
           r.id, r.rating, r.comment, r.created_at,
           CONCAT(c.first_name, ' ', c.last_name) AS author_name,
           COALESCE(NULLIF(TRIM(p.activity_name), ''), p.first_name || ' ' || p.last_name) AS pro_name,
           COUNT(rf.id) AS flags_count
         FROM reviews r
         JOIN users c ON c.id = r.client_id
         JOIN users p ON p.id = r.pro_id
         ${flaggedOnly ? "JOIN" : "LEFT JOIN"} review_flags rf ON rf.review_id = r.id
         WHERE ${deletedCondition}
         GROUP BY r.id, c.first_name, c.last_name, p.activity_name, p.first_name, p.last_name
         ORDER BY MAX(rf.created_at) DESC NULLS LAST, r.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      res.json({
        success: true,
        total,
        data: (rows as any[]).map((r) => ({ ...r, flags_count: Number(r.flags_count) })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* DELETE /reviews/:id — soft delete (so it can be undone via /restore) and
 * notifies the pro it was removed from her profile. */
router.delete(
  "/reviews/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const reviewId = parseParamToInt(req.params.id);

      const [rows] = await db.query(
        `UPDATE reviews SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL RETURNING pro_id`,
        [reviewId]
      );
      const proId = (rows as any[])[0]?.pro_id;

      if (proId) {
        try {
          const message = "Un avis laissé sur ton profil a été supprimé par l'équipe Blyss.";
          const [notifRows] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'review_deleted', 'Avis supprimé', ?, ?)
             RETURNING id, created_at`,
            [proId, message, JSON.stringify({ review_id: reviewId })]
          );
          const notif = (notifRows as any[])[0];
          if (notif) {
            await sendNotificationToUser(proId, {
              id: notif.id,
              type: "review_deleted",
              title: "Avis supprimé",
              message,
              data: { review_id: reviewId },
              created_at: notif.created_at,
            });
          }
        } catch {
          // non-fatal — the deletion itself already succeeded
        }
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /reviews/:id/restore — undoes a moderation delete, notifies the pro
 * it's back on her profile. */
router.patch(
  "/reviews/:id/restore",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const reviewId = parseParamToInt(req.params.id);

      const [rows] = await db.query(
        `UPDATE reviews SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL RETURNING pro_id`,
        [reviewId]
      );
      const proId = (rows as any[])[0]?.pro_id;

      if (proId) {
        try {
          const message = "L'avis précédemment supprimé a été remis en ligne sur ton profil.";
          const [notifRows] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'review_restored', 'Avis remis en ligne', ?, ?)
             RETURNING id, created_at`,
            [proId, message, JSON.stringify({ review_id: reviewId })]
          );
          const notif = (notifRows as any[])[0];
          if (notif) {
            await sendNotificationToUser(proId, {
              id: notif.id,
              type: "review_restored",
              title: "Avis remis en ligne",
              message,
              data: { review_id: reviewId },
              created_at: notif.created_at,
            });
          }
        } catch {
          // non-fatal — the restore itself already succeeded
        }
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /reviews/:id/ignore — dismisses the flag(s), keeps the review. */
router.patch(
  "/reviews/:id/ignore",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const reviewId = parseParamToInt(req.params.id);
      await db.query(`DELETE FROM review_flags WHERE review_id = ?`, [reviewId]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/* ── MESSAGES MODERATION (app/(admin-tools)/messages.tsx) ──────────────────
 * Modération sur signalement uniquement — un fil n'apparaît ici que si une
 * cliente ou une pro l'a signalé via POST /api/messages/threads/:id/report.
 * Pas de scan proactif des conversations. */

/* GET /messages/threads?flagged=true — file de modération.
 * GET /messages/threads?deleted=true — fils déjà modérés (contenu effacé), pour restauration. */
router.get(
  "/messages/threads",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const flaggedOnly = req.query.flagged === "true";
      const deletedOnly = req.query.deleted === "true";
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;
      const deletedCondition = deletedOnly
        ? "EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.deleted_at IS NOT NULL)"
        : "TRUE";

      // flagged=true ne montre que les signalements en attente — un fil dont
      // le seul signalement a déjà été traité (ignore/delete) sort de la file.
      const flagJoinCondition = flaggedOnly ? "f.thread_id = t.id AND f.status = 'pending'" : "f.thread_id = t.id";

      const [totalRows] = await db.query(
        `SELECT COUNT(DISTINCT t.id) AS total
         FROM message_threads t
         ${flaggedOnly ? "JOIN" : "LEFT JOIN"} message_flags f ON ${flagJoinCondition}
         WHERE ${deletedCondition}`,
        []
      );
      const total = Number((totalRows as any[])[0]?.total ?? 0);

      const [rows] = await db.query(
        `SELECT
           t.id, t.last_message_preview, t.last_message_at, t.created_at, t.is_locked,
           COALESCE(cu.first_name || ' ' || cu.last_name, 'Compte supprimé') AS client_name,
           COALESCE(NULLIF(TRIM(pu.activity_name), ''), pu.first_name || ' ' || pu.last_name, 'Compte supprimé') AS pro_name,
           COUNT(f.id) FILTER (WHERE f.status = 'pending') AS flags_count,
           COUNT(f.id) AS flags_total,
           MAX(f.reason_code) AS last_reason_code,
           MAX(f.reason) AS last_reason
         FROM message_threads t
         LEFT JOIN users cu ON cu.id = t.client_id
         LEFT JOIN users pu ON pu.id = t.pro_id
         ${flaggedOnly ? "JOIN" : "LEFT JOIN"} message_flags f ON ${flagJoinCondition}
         WHERE ${deletedCondition}
         GROUP BY t.id, cu.first_name, cu.last_name, pu.activity_name, pu.first_name, pu.last_name
         ORDER BY MAX(f.created_at) DESC NULLS LAST, t.last_message_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      res.json({
        success: true,
        total,
        data: (rows as any[]).map((r) => ({ ...r, flags_count: Number(r.flags_count), flags_total: Number(r.flags_total) })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* GET /messages/threads/:id — contenu complet du fil, pour l'examen admin. */
router.get(
  "/messages/threads/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const threadId = parseParamToInt(req.params.id);

      const [messages] = await db.query(
        `SELECT m.id, m.sender_id, m.body, m.attachment_url, m.created_at, m.deleted_at,
           CASE WHEN m.sender_id = t.client_id THEN 'client' WHEN m.sender_id = t.pro_id THEN 'pro' ELSE NULL END AS sender_role
         FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         WHERE m.thread_id = ?
         ORDER BY m.created_at ASC`,
        [threadId]
      );

      const [flags] = await db.query(
        `SELECT f.id, f.reason_code, f.reason, f.status, f.outcome, f.created_at, f.handled_at,
           COALESCE(u.first_name || ' ' || u.last_name, 'Compte supprimé') AS flagged_by_name,
           COALESCE(ru.first_name || ' ' || ru.last_name, 'Compte supprimé') AS reported_user_name
         FROM message_flags f
         LEFT JOIN users u ON u.id = f.flagged_by
         LEFT JOIN users ru ON ru.id = f.reported_user_id
         WHERE f.thread_id = ? ORDER BY f.created_at DESC`,
        [threadId]
      );

      res.json({ success: true, data: { messages, flags } });
    } catch (error) {
      next(error);
    }
  }
);

/* DELETE /messages/threads/:id — efface le contenu du fil (modération) et
 * prévient les deux participants. Soft-delete (deleted_at), comme les avis. */
router.delete(
  "/messages/threads/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const threadId = parseParamToInt(req.params.id);
      const adminId = req.user!.id;

      const [threadRows] = await db.query(
        `UPDATE messages SET deleted_at = NOW() WHERE thread_id = ? AND deleted_at IS NULL
         RETURNING (SELECT client_id FROM message_threads WHERE id = ?) AS client_id,
                    (SELECT pro_id FROM message_threads WHERE id = ?) AS pro_id`,
        [threadId, threadId, threadId]
      );
      const participants = (threadRows as any[])[0];

      // Le contenu est effacé : le fil reste verrouillé (pas de retour à la
      // conversation), et les signalements passent en "fondé" (upheld) — ils
      // comptent pour la vigilance de la personne visée. Voir /ignore pour le
      // cas inverse (pas de faute) et GET /users/:id/reports pour l'historique.
      await db.query(
        `UPDATE message_flags SET status = 'reviewed', outcome = 'upheld', handled_at = NOW(), handled_by = ?
         WHERE thread_id = ? AND status = 'pending'`,
        [adminId, threadId]
      );

      for (const participantId of [participants?.client_id, participants?.pro_id].filter(Boolean)) {
        try {
          const message = "Une conversation a été modérée par l'équipe Blyss suite à un signalement.";
          const [notifRows] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'thread_moderated', 'Conversation modérée', ?, ?)
             RETURNING id, created_at`,
            [participantId, message, JSON.stringify({ thread_id: threadId })]
          );
          const notif = (notifRows as any[])[0];
          if (notif) {
            await sendNotificationToUser(participantId, {
              id: notif.id,
              type: "thread_moderated",
              title: "Conversation modérée",
              message,
              data: { thread_id: threadId },
              created_at: notif.created_at,
            });
          }
        } catch {
          // non-fatal — la modération elle-même a déjà réussi
        }
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /messages/threads/:id/restore — annule une modération : la personne
 * visée n'y était pour rien, le signalement est requalifié en "dismissed"
 * (exonéré) et sort donc du compteur de vigilance. */
router.patch(
  "/messages/threads/:id/restore",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const threadId = parseParamToInt(req.params.id);
      const adminId = req.user!.id;
      await db.query(`UPDATE messages SET deleted_at = NULL WHERE thread_id = ? AND deleted_at IS NOT NULL`, [threadId]);
      await db.query(
        `UPDATE message_flags SET status = 'reviewed', outcome = 'dismissed', handled_at = NOW(), handled_by = ?
         WHERE thread_id = ? AND outcome = 'upheld'`,
        [adminId, threadId]
      );
      await db.query(`UPDATE message_threads SET is_locked = FALSE WHERE id = ?`, [threadId]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/* PATCH /messages/threads/:id/ignore — classe le signalement sans rien modérer :
 * la personne visée n'est pas fautive, donc outcome='dismissed' — exclu du
 * compteur de vigilance (voir GET /users/:id/reports). Les lignes restent en
 * base (status='reviewed') pour l'historique, contrairement à l'ancien DELETE. */
router.patch(
  "/messages/threads/:id/ignore",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const threadId = parseParamToInt(req.params.id);
      const adminId = req.user!.id;
      await db.query(
        `UPDATE message_flags SET status = 'reviewed', outcome = 'dismissed', handled_at = NOW(), handled_by = ?
         WHERE thread_id = ? AND status = 'pending'`,
        [adminId, threadId]
      );
      await db.query(`UPDATE message_threads SET is_locked = FALSE WHERE id = ?`, [threadId]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
