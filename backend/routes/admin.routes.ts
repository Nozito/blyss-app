import express, { Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticateToken } from "../middleware/auth";
import { requireAdminMiddleware } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import { sendNotificationToUser } from "../lib/notifications";
import { AuthenticatedRequest } from "../lib/types";
import { parseParamToInt } from "../lib/helpers";
import { runReminderCycle } from "../lib/reminders";

const router = express.Router();

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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user_id, type, title, message, data } = req.body;

      if (!user_id || !type || !title || !message) {
        return res.status(400).json({
          success: false,
          message: "Champs requis : user_id, type, title, message",
        });
      }

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

      const db = getDb();
      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM users`);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [users] = await db.query(`
        SELECT
          id, first_name, last_name, email, phone_number, birth_date, role,
          is_admin, is_active, created_at, activity_name, city,
          instagram_account, profile_photo, banner_photo, pro_status, bio
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      res.json({ success: true, data: users, meta: { page, limit, total } });
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        first_name, last_name, phone_number, email, birth_date, role, is_admin,
        activity_name, city, instagram_account, profile_photo, banner_photo,
        bankaccountname, IBAN, iban_last4, accept_online_payment, pro_status,
        bio, profile_visibility,
      } = req.body;

      if (!first_name || !last_name || !phone_number || !email || !role) {
        return res.status(400).json({
          success: false,
          message: "Les champs first_name, last_name, phone_number, email et role sont obligatoires",
        });
      }

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

      let iban_hash = null;
      let computed_iban_last4 = iban_last4 || null;
      if (IBAN) {
        iban_hash = crypto.createHash("sha256").update(IBAN).digest("hex");
        if (!computed_iban_last4) computed_iban_last4 = IBAN.slice(-4);
      }

      await db.query(
        `INSERT INTO users (
          first_name, last_name, phone_number, email, birth_date, password_hash,
          is_verified, role, is_admin, created_at, activity_name, city,
          instagram_account, profile_photo, banner_photo, bankaccountname,
          IBAN, iban_last4, iban_hash, accept_online_payment, pro_status, bio, profile_visibility
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          first_name, last_name, phone_number, email, formattedBirthDate, password_hash,
          0, role, is_admin ? 1 : 0,
          activity_name || null, city || null, instagram_account || null,
          profile_photo || null, banner_photo || null, bankaccountname || null,
          IBAN || null, computed_iban_last4, iban_hash,
          accept_online_payment ? 1 : 0, pro_status || "inactive",
          bio || null, profile_visibility || "public",
        ]
      );

      res.json({ success: true, message: "Utilisateur créé avec succès" });
    } catch (error) {
      next(error);
    }
  }
);

/* PUT /users/:id */
router.put(
  "/users/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.id;
      const {
        first_name, last_name, phone_number, email, birth_date, role, is_admin,
        activity_name, city, instagram_account, profile_photo, banner_photo,
        bankaccountname, IBAN, iban_last4, accept_online_payment, pro_status,
        bio, profile_visibility, is_verified,
      } = req.body;

      if (!first_name || !last_name || !phone_number || !email || !role) {
        return res.status(400).json({
          success: false,
          message: "Les champs first_name, last_name, phone_number, email et role sont obligatoires",
        });
      }

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

      let iban_hash = null;
      let computed_iban_last4 = iban_last4 || null;
      if (IBAN) {
        iban_hash = crypto.createHash("sha256").update(IBAN).digest("hex");
        if (!computed_iban_last4) computed_iban_last4 = IBAN.slice(-4);
      }

      await db.query(
        `UPDATE users SET
          first_name = ?, last_name = ?, phone_number = ?, email = ?,
          birth_date = ?, role = ?, is_admin = ?, activity_name = ?,
          city = ?, instagram_account = ?, profile_photo = ?, banner_photo = ?,
          bankaccountname = ?, IBAN = ?, iban_last4 = ?, iban_hash = ?,
          accept_online_payment = ?, pro_status = ?, bio = ?,
          profile_visibility = ?, is_verified = ?
        WHERE id = ?`,
        [
          first_name, last_name, phone_number, email, formattedBirthDate,
          role, is_admin ? 1 : 0,
          activity_name || null, city || null, instagram_account || null,
          profile_photo || null, banner_photo || null, bankaccountname || null,
          IBAN || null, computed_iban_last4, iban_hash,
          accept_online_payment ? 1 : 0, pro_status || "inactive",
          bio || null, profile_visibility || "public",
          is_verified ? 1 : 0, userId,
        ]
      );

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
    try {
      const db = getDb();
      const userId = req.params.id;

      const [userRows] = await db.query("SELECT is_admin FROM users WHERE id = ?", [userId]);
      if ((userRows as any[])[0]?.is_admin) {
        const [adminsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE");
        if ((adminsRows as any[])[0].count <= 1) {
          return res.status(400).json({
            success: false,
            message: "Impossible de supprimer le dernier administrateur",
          });
        }
      }

      const [result] = await db.query("DELETE FROM users WHERE id = ?", [userId]);
      if ((result as any).affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }

      res.json({ success: true, message: "Utilisateur supprimé avec succès" });
    } catch (error) {
      next(error);
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

      const db = getDb();
      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM reservations`);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [bookings] = await db.query(`
        SELECT
          r.*,
          CONCAT(c.first_name, ' ', c.last_name) as client_name,
          CONCAT(p.first_name, ' ', p.last_name) as pro_name
        FROM reservations r
        LEFT JOIN users c ON r.client_id = c.id
        LEFT JOIN users p ON r.pro_id = p.id
        ORDER BY r.start_datetime DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      res.json({ success: true, data: bookings, meta: { page, limit, total } });
    } catch (error) {
      next(error);
    }
  }
);

/* POST /bookings/create */
router.post(
  "/bookings/create",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

      if (!client_id || !pro_id || !prestation_id || !start_datetime || !end_datetime || !price) {
        return res.status(400).json({
          success: false,
          message: "Tous les champs requis doivent être remplis",
        });
      }

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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params.id;
      const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

      if (!client_id || !pro_id || !prestation_id || !start_datetime || !end_datetime || !price) {
        return res.status(400).json({
          success: false,
          message: "Tous les champs requis doivent être remplis",
        });
      }

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
      const [result] = await getDb().query("DELETE FROM reservations WHERE id = ?", [bookingId]);

      if ((result as any).affectedRows === 0) {
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
    try {
      await runReminderCycle();
      res.json({ success: true, message: "Reminder cycle triggered" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
