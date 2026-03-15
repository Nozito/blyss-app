import express, { Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticateToken } from "../middleware/auth";
import { adminLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import { sendNotificationToUser } from "../lib/notifications";
import { AuthenticatedRequest } from "../lib/types";
import { parseParamToInt } from "../lib/helpers";
import { runReminderCycle } from "../lib/reminders";

const router = express.Router();

// ── Helper: check admin or return 403 ────────────────────────────────────────
async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<boolean> {
  const adminId = req.user?.id;
  const [rows] = await getDb().query(
    "SELECT is_admin FROM users WHERE id = ?",
    [adminId]
  );
  if ((rows as any[]).length === 0 || !(rows as any[])[0].is_admin) {
    res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    return false;
  }
  return true;
}

/* GET /users/:userId/notification-settings */
router.get(
  "/users/:userId/notification-settings",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      const table =
        role === "pro" ? "pro_notification_settings" : "client_notification_settings";

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
      console.error("Get notification settings error:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /notifications/create */
router.post(
  "/notifications/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

      const { user_id, type, title, message, data } = req.body;

      if (!user_id || !type || !title || !message) {
        return res.status(400).json({
          success: false,
          message: "Champs requis : user_id, type, title, message",
        });
      }

      const db = getDb();
      const [result] = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        [user_id, type, title, message, data ? JSON.stringify(data) : null]
      );

      const notificationId = (result as any).insertId;

      const [notifRows] = await db.query(
        `SELECT id, user_id, type, title, message, data, is_read, created_at
         FROM notifications WHERE id = ?`,
        [notificationId]
      );

      const notification = (notifRows as any[])[0];
      sendNotificationToUser(user_id, notification);

      res.json({
        success: true,
        message: "Notification créée et envoyée",
        data: { id: notificationId },
      });
    } catch (error) {
      console.error("Create notification error:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* GET /users */
router.get(
  "/users",
  authenticateToken,
  adminLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const db = getDb();
      const [countRows] = await db.query(`SELECT COUNT(*) as total FROM users`);
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [users] = await db.query(`
        SELECT
          id, first_name, last_name, email, phone_number, birth_date, role,
          is_admin, is_verified, created_at, activity_name, city,
          instagram_account, profile_photo, banner_photo, pro_status, bio
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      res.json({ success: true, data: users, meta: { page, limit, total } });
    } catch (error) {
      console.error("❌ Error fetching users:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* GET /dashboard/counts */
router.get(
  "/dashboard/counts",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
        console.log("Notifications table not found, defaulting to 0");
      }

      res.json({
        success: true,
        counts: { totalUsers, totalBookings, unreadNotifications },
      });
    } catch (error) {
      console.error("Error fetching counts:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* GET /dashboard/stats */
router.get(
  "/dashboard/stats",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

      const db = getDb();

      const [totalUsersRows] = await db.query("SELECT COUNT(*) as count FROM users");
      const totalUsers = (totalUsersRows as any[])[0]?.count || 0;

      const [totalProsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'pro'");
      const totalPros = (totalProsRows as any[])[0]?.count || 0;

      const [totalClientsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'client'");
      const totalClients = (totalClientsRows as any[])[0]?.count || 0;

      const [totalBookingsRows] = await db.query("SELECT COUNT(*) as count FROM reservations");
      const totalBookings = (totalBookingsRows as any[])[0]?.count || 0;

      const [todayBookingsRows] = await db.query(
        "SELECT COUNT(*) as count FROM reservations WHERE start_datetime::date = CURRENT_DATE"
      );
      const todayBookings = (todayBookingsRows as any[])[0]?.count || 0;

      const [totalRevenueRows] = await db.query(
        "SELECT COALESCE(SUM(price), 0) as total FROM reservations WHERE status IN ('confirmed', 'completed')"
      );
      const totalRevenue = Number((totalRevenueRows as any[])[0]?.total || 0);

      const [monthRevenueRows] = await db.query(
        "SELECT COALESCE(SUM(price), 0) as total FROM reservations WHERE status IN ('confirmed', 'completed') AND EXTRACT(YEAR FROM start_datetime) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM start_datetime) = EXTRACT(MONTH FROM CURRENT_DATE)"
      );
      const monthRevenue = Number((monthRevenueRows as any[])[0]?.total || 0);

      const [activeUsersRows] = await db.query(
        "SELECT COUNT(DISTINCT user_id) as count FROM refresh_tokens WHERE expires_at > NOW() AND revoked = false AND created_at >= NOW() - INTERVAL '7 days'"
      );
      const activeUsers = (activeUsersRows as any[])[0]?.count || 0;

      const [recentActivity] = await db.query(`
        (SELECT
          'booking' as type,
          CONCAT('Nouvelle réservation de ', c.first_name, ' ', c.last_name) as title,
          CONCAT('Chez ', p.first_name, ' ', p.last_name) as description,
          TO_CHAR(r.created_at, 'HH24:MI') as time,
          r.created_at as timestamp
        FROM reservations r
        JOIN users c ON c.id = r.client_id
        JOIN users p ON p.id = r.pro_id
        WHERE r.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY r.created_at DESC
        LIMIT 5)

        UNION ALL

        (SELECT
          'user' as type,
          CONCAT('Nouvel utilisateur : ', u.first_name, ' ', u.last_name) as title,
          CONCAT('Rôle : ', CASE WHEN u.role = 'pro' THEN 'Professionnel' ELSE 'Client' END) as description,
          TO_CHAR(u.created_at, 'HH24:MI') as time,
          u.created_at as timestamp
        FROM users u
        WHERE u.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY u.created_at DESC
        LIMIT 5)

        ORDER BY timestamp DESC
        LIMIT 10
      `);

      res.json({
        success: true,
        stats: {
          totalUsers, totalPros, totalClients, totalBookings,
          todayBookings, totalRevenue, monthRevenue, activeUsers,
        },
        recentActivity: (recentActivity as any[]).map((a: any) => ({
          type: a.type,
          title: a.title,
          description: a.description,
          time: a.time,
        })),
      });
    } catch (error) {
      console.error("Error fetching admin dashboard stats:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /users/create */
router.post(
  "/users/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error creating user:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PUT /users/:id */
router.put(
  "/users/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error updating user:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* DELETE /users/:id */
router.delete(
  "/users/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error deleting user:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PATCH /users/:id/deactivate */
router.patch(
  "/users/:id/deactivate",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error deactivating user:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PATCH /users/:id/reactivate */
router.patch(
  "/users/:id/reactivate",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error reactivating user:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* GET /bookings */
router.get(
  "/bookings",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error fetching bookings:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /bookings/create */
router.post(
  "/bookings/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error creating booking:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PUT /bookings/:id */
router.put(
  "/bookings/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

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
      console.error("Error updating booking:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* DELETE /bookings/:id */
router.delete(
  "/bookings/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;

      const bookingId = req.params.id;
      const [result] = await getDb().query("DELETE FROM reservations WHERE id = ?", [bookingId]);

      if ((result as any).affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Réservation non trouvée" });
      }

      res.json({ success: true, message: "Réservation supprimée avec succès" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /reminders/trigger — manual trigger for testing (dev only) */
router.post(
  "/reminders/trigger",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      await runReminderCycle();
      res.json({ success: true, message: "Reminder cycle triggered" });
    } catch (err) {
      console.error("Error triggering reminders:", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  }
);

export default router;
