// ==========================================
// 1. IMPORTS
// ==========================================
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { isValidIBAN, electronicFormatIBAN } from "ibantools";
import crypto from "crypto";

// ==========================================
// 2. CONFIGURATION ENV
// ==========================================
const envFile = process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
const envPath = path.resolve(__dirname, "..", envFile);
console.log("Loading env from:", envPath);

dotenv.config({ path: envPath });

console.log("JWT_SECRET after dotenv =", process.env.JWT_SECRET);

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not defined. Exiting.");
  process.exit(1);
}

// ==========================================
// 3. INTERFACES
// ==========================================
interface AuthenticatedRequest extends Request {
  user?: { id: number };
  file?: Express.Multer.File;
}

type AuthRequest = AuthenticatedRequest;

// ==========================================
// 4. EXPRESS APP + HTTP SERVER
// ==========================================
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8080",
  "https://app.blyssapp.fr",
];

// ==========================================
// 5. CONNEXION DATABASE
// ==========================================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

console.log("✅ Database pool created");

// ==========================================
// 6. WEBSOCKET - CLIENTS MAP (AVANT LES FONCTIONS)
// ==========================================
const connectedClients = new Map<number, WebSocket>();

// ==========================================
// 7. NOTIFICATION MAPPING & HELPERS
// ==========================================
const CLIENT_NOTIFICATION_MAPPING: { [key: string]: string } = {
  booking_confirmed: "changes",
  booking_reminder: "reminders",
  booking_cancelled: "changes",
  message_received: "messages",
  late_alert: "late",
  promotional: "offers",
  email_summary: "email_summary",
  info: "offers",
};

const PRO_NOTIFICATION_MAPPING: { [key: string]: string } = {
  new_booking: "new_reservation",
  booking_confirmed: "cancel_change",
  booking_cancelled: "cancel_change",
  booking_reminder: "daily_reminder",
  message_received: "client_message",
  payment_received: "payment_alert",
  activity_summary: "activity_summary",
  promotional: "activity_summary",
  info: "activity_summary",
};

async function checkNotificationPreference(
  userId: number,
  notificationType: string
): Promise<boolean> {
  try {
    const [userRows] = await db.query(
      `SELECT role FROM users WHERE id = ?`,
      [userId]
    );

    if ((userRows as any[]).length === 0) {
      return false;
    }

    const role = (userRows as any[])[0].role;

    const mapping = role === "pro"
      ? PRO_NOTIFICATION_MAPPING
      : CLIENT_NOTIFICATION_MAPPING;

    const column = mapping[notificationType] || (role === "pro" ? "activity_summary" : "offers");

    const table = role === "pro"
      ? "pro_notification_settings"
      : "client_notification_settings";

    const [settings] = await db.query(
      `SELECT ${column} FROM ${table} WHERE user_id = ?`,
      [userId]
    );

    if ((settings as any[]).length === 0) {
      const defaultColumns = role === "pro"
        ? {
          user_id: userId,
          new_reservation: 1,
          cancel_change: 1,
          daily_reminder: 1,
          client_message: 1,
          payment_alert: 1,
          activity_summary: 1,
        }
        : {
          user_id: userId,
          reminders: 1,
          changes: 1,
          messages: 1,
          late: 1,
          offers: 1,
          email_summary: 0,
        };

      await db.query(
        `INSERT INTO ${table} SET ?`,
        [defaultColumns]
      );
      return true;
    }

    return (settings as any[])[0][column] === 1;
  } catch (error) {
    console.error("Error checking notification preference:", error);
    return true;
  }
}

async function sendUnreadNotifications(ws: WebSocket, userId: number) {
  try {
    const [rows] = await db.query(
      `SELECT 
        id, 
        user_id, 
        type, 
        title, 
        message, 
        data, 
        is_read, 
        created_at
      FROM notifications
      WHERE user_id = ? AND is_read = 0
      ORDER BY created_at DESC`,
      [userId]
    );

    if ((rows as any[]).length > 0) {
      ws.send(
        JSON.stringify({
          type: "notifications",
          data: rows,
        })
      );
    }
  } catch (error) {
    console.error("Error sending unread notifications:", error);
  }
}

export async function sendNotificationToUser(
  userId: number,
  notification: {
    id: number;
    type: string;
    title: string;
    message: string;
    data?: any;
    created_at: string;
  }
) {
  const hasPermission = await checkNotificationPreference(
    userId,
    notification.type
  );

  if (!hasPermission) {
    console.log(`⚠️ User ${userId} has disabled ${notification.type} notifications`);
    return false;
  }

  const ws = connectedClients.get(userId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "new_notification",
        data: notification,
      })
    );
    console.log(`📨 Notification sent to user ${userId}`);
    return true;
  }

  console.log(`⚠️ User ${userId} not connected`);
  return false;
}

export async function broadcastNotification(
  userIds: number[],
  notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }
) {
  for (const userId of userIds) {
    const hasPermission = await checkNotificationPreference(
      userId,
      notification.type
    );

    if (!hasPermission) {
      continue;
    }

    const ws = connectedClients.get(userId);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "new_notification",
          data: notification,
        })
      );
    }
  }
}

// ==========================================
// 8. MIDDLEWARE
// ==========================================
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Auth: No token provided");
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    console.log("✅ Auth: Token decoded, userId:", decoded.id);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    console.error("❌ Auth: JWT error:", err);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

const authenticateToken = authMiddleware;

// ==========================================
// 9. WEBSOCKET SERVER
// ==========================================
const wss = new WebSocketServer({ server });

interface WebSocketMessage {
  type: string;
  data?: any;
}

wss.on("connection", (ws: WebSocket, req) => {
  console.log("🔌 New WebSocket connection");

  let userId: number | null = null;
  let isAuthenticated = false;

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message.toString()) as WebSocketMessage;

      if (data.type === "auth" && data.data?.token) {
        try {
          const decoded = jwt.verify(
            data.data.token,
            process.env.JWT_SECRET!
          ) as { id: number };

          userId = decoded.id;
          isAuthenticated = true;

          connectedClients.set(userId, ws);

          console.log(`✅ User ${userId} authenticated via WebSocket`);

          ws.send(
            JSON.stringify({
              type: "auth_success",
              data: { userId },
            })
          );

          await sendUnreadNotifications(ws, userId);

        } catch (err) {
          console.error("❌ WebSocket auth failed:", err);
          ws.send(
            JSON.stringify({
              type: "auth_error",
              data: { message: "Invalid token" },
            })
          );
          ws.close();
        }
      }

      if (data.type === "mark_read" && isAuthenticated && userId) {
        const notificationId = data.data?.notificationId;

        if (notificationId) {
          await db.query(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [notificationId, userId]
          );

          ws.send(
            JSON.stringify({
              type: "mark_read_success",
              data: { notificationId },
            })
          );
        }
      }

      if (data.type === "mark_all_read" && isAuthenticated && userId) {
        await db.query(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
          [userId]
        );

        ws.send(
          JSON.stringify({
            type: "mark_all_read_success",
          })
        );
      }

    } catch (error) {
      console.error("❌ WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    if (userId) {
      connectedClients.delete(userId);
      console.log(`🔌 User ${userId} disconnected from WebSocket`);
    }
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });

  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on("close", () => {
    clearInterval(interval);
  });
});

// ==========================================
// API ROUTES - NOTIFICATIONS
// ==========================================

/* GET: Récupérer les préférences de notification d'un utilisateur (ADMIN) */
app.get(
  "/api/admin/users/:userId/notification-settings",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user?.id;
      const userId = parseParamToInt(req.params.userId);

      // Vérifier que c'est un admin
      const [adminCheck] = await db.query(
        `SELECT is_admin FROM users WHERE id = ?`,
        [adminId]
      );

      if ((adminCheck as any[]).length === 0 || !(adminCheck as any[])[0].is_admin) {
        return res.status(403).json({
          success: false,
          message: "Accès réservé aux admins",
        });
      }

      // Récupérer le rôle de l'utilisateur
      const [userRows] = await db.query(
        `SELECT role FROM users WHERE id = ?`,
        [userId]
      );

      if ((userRows as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable",
        });
      }

      const role = (userRows as any[])[0].role;
      const table = role === "pro"
        ? "pro_notification_settings"
        : "client_notification_settings";

      // Récupérer les settings
      const [settings] = await db.query(
        `SELECT * FROM ${table} WHERE user_id = ?`,
        [userId]
      );

      if ((settings as any[]).length === 0) {
        // Créer des settings par défaut
        if (role === "pro") {
          const defaultSettings = {
            user_id: userId,
            new_reservation: 1,
            cancel_change: 1,
            daily_reminder: 1,
            client_message: 1,
            payment_alert: 1,
            activity_summary: 1,
          };

          await db.query(
            `INSERT INTO pro_notification_settings SET ?`,
            [defaultSettings]
          );

          return res.json({
            success: true,
            data: defaultSettings,
          });
        } else {
          const defaultSettings = {
            user_id: userId,
            reminders: 1,
            changes: 1,
            messages: 1,
            late: 1,
            offers: 1,
            email_summary: 0,
          };

          await db.query(
            `INSERT INTO client_notification_settings SET ?`,
            [defaultSettings]
          );

          return res.json({
            success: true,
            data: defaultSettings,
          });
        }
      }

      res.json({
        success: true,
        data: (settings as any[])[0],
      });
    } catch (error) {
      console.error("Get notification settings error:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur",
      });
    }
  }
);


/* POST: Créer une notification (ADMIN) */
app.post(
  "/api/admin/notifications/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user?.id;

      // Vérifier que c'est un admin
      const [adminCheck] = await db.query(
        `SELECT is_admin FROM users WHERE id = ?`,
        [adminId]
      );

      if ((adminCheck as any[]).length === 0 || !(adminCheck as any[])[0].is_admin) {
        return res.status(403).json({
          success: false,
          message: "Accès réservé aux admins",
        });
      }

      const { user_id, type, title, message, data } = req.body;

      if (!user_id || !type || !title || !message) {
        return res.status(400).json({
          success: false,
          message: "Champs requis : user_id, type, title, message",
        });
      }

      // Insérer en BDD
      const [result] = await db.query(
        `INSERT INTO notifications 
         (user_id, type, title, message, data, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        [user_id, type, title, message, data ? JSON.stringify(data) : null]
      );

      const notificationId = (result as any).insertId;

      // Récupérer la notification complète
      const [notifRows] = await db.query(
        `SELECT id, user_id, type, title, message, data, is_read, created_at
         FROM notifications
         WHERE id = ?`,
        [notificationId]
      );

      const notification = (notifRows as any[])[0];

      // 🚀 Envoyer en temps réel via WebSocket
      sendNotificationToUser(user_id, notification);

      res.json({
        success: true,
        message: "Notification créée et envoyée",
        data: { id: notificationId },
      });
    } catch (error) {
      console.error("Create notification error:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur",
      });
    }
  }
);

// GET tous les utilisateurs
app.get("/api/admin/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    // ✅ CORRECTION: Sélectionner TOUS les champs explicitement
    const [users] = await db.query(`
      SELECT 
        id,
        first_name,
        last_name,
        email,
        phone_number,
        birth_date,
        role,
        is_admin,
        is_verified,
        created_at,
        activity_name,
        city,
        instagram_account,
        profile_photo,
        banner_photo,
        pro_status,
        bio
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({ success: true, data: users });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});


// ==========================================
// CONFIGURATION CHIFFREMENT IBAN
// ==========================================

const IBAN_KEY = process.env.IBAN_ENC_KEY
  ? Buffer.from(process.env.IBAN_ENC_KEY, "hex")
  : null;

const IBAN_IV = process.env.IBAN_ENC_IV
  ? Buffer.from(process.env.IBAN_ENC_IV, "hex")
  : null;

if (!IBAN_KEY || IBAN_KEY.length !== 32) {
  process.exit(1);
}

if (!IBAN_IV || ![12, 16].includes(IBAN_IV.length)) {
  process.exit(1);
}

console.log("✅ Clés de chiffrement IBAN chargées");

function encryptSensitiveData(plain: string): string {
  if (!plain || plain.trim() === '') {
    return '';
  }
  if (!IBAN_KEY || !IBAN_IV) {
    throw new Error("Clés de chiffrement IBAN non configurées");
  }
  const cipher = crypto.createCipheriv("aes-256-gcm", IBAN_KEY, IBAN_IV);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

function decryptSensitiveData(stored: string): string {
  if (!stored || stored.trim() === '') {
    return '';
  }
  if (!IBAN_KEY || !IBAN_IV) {
    throw new Error("Clés de chiffrement IBAN non configurées");
  }
  const [cipherTextB64, tagB64] = stored.split(":");
  if (!cipherTextB64 || !tagB64) {
    throw new Error("Invalid encrypted data format");
  }
  const encrypted = Buffer.from(cipherTextB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", IBAN_KEY, IBAN_IV);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

const encryptIban = encryptSensitiveData;
const decryptIban = decryptSensitiveData;

// ==========================================
// INTERFACES
// ==========================================

interface SignupRequestBody {
  first_name?: string;
  last_name?: string;
  email: string;
  password: string;
  phone_number?: string;
  birth_date?: string;
  role?: string;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  birth_date: string | null;
  password_hash: string;
  role: string;
  activity_name: string | null;
  city: string | null;
  instagram_account: string | null;
  profile_photo: string | null;
  pro_status?: "active" | "inactive" | null;
  IBAN?: string | null;
  bankaccountname?: string | null;
  bio?: string | null;
  is_admin?: boolean;
}

interface UpdatePaymentsBody {
  bankaccountname?: string;
  IBAN?: string;
  accept_online_payment?: boolean;
}

interface CreateSubscriptionBody {
  plan: "start" | "serenite" | "signature";
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice?: number | null;
  commitmentMonths?: number | null;
  startDate: string;
  endDate?: string | null;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Parse un paramètre de route en nombre
 * @param param - Le paramètre à parser (string | string[])
 * @returns Le nombre parsé
 * @throws Error si le paramètre est invalide
 */
function parseParamToInt(param: string | string[] | undefined): number {
  if (!param) {
    throw new Error("Paramètre manquant");
  }

  const value = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error("Paramètre invalide");
  }

  return parsed;
}

function generateAccessToken(userId: number) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

async function generateAndStoreRefreshToken(userId: number) {
  const refreshToken = crypto.randomBytes(64).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.execute(
    `
      INSERT INTO refresh_tokens (user_id, token, expires_at, revoked)
      VALUES (?, ?, ?, 0)
    `,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
}

async function revokeRefreshToken(token: string) {
  await db.execute(
    `
      UPDATE refresh_tokens
      SET revoked = 1
      WHERE token = ?
    `,
    [token]
  );
}

function getProId(req: AuthenticatedRequest): number {
  const proId = req.user?.id;
  if (!proId) {
    throw new Error("Pro non authentifié");
  }
  return proId;
}

// ==========================================
// PUBLIC ROUTES - SPECIALISTS
// ==========================================

/* GET SINGLE PRO (PUBLIC) */
app.get(
  "/api/users/pros/:id",
  async (req: Request, res: Response) => {
    try {
      const proId = parseParamToInt(req.params.id);

      if (isNaN(proId)) {
        return res.status(400).json({
          success: false,
          message: "ID invalide"
        });
      }

      const [rows] = await db.query(
        `SELECT 
          id, first_name, last_name, activity_name, city, 
          instagram_account, profile_photo, banner_photo, bio, pro_status
        FROM users
        WHERE id = ? AND role = 'pro' AND pro_status = 'active'`,
        [proId]
      );

      const pro = (rows as any[])[0];

      if (!pro) {
        return res.status(404).json({
          success: false,
          message: "Professionnel non trouvé"
        });
      }

      console.log("✅ Pro found:", pro.id);

      res.json({ success: true, data: pro });
    } catch (error) {
      console.error("❌ Error fetching pro:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    }
  }
);

/* GET PRESTATIONS BY PRO (PUBLIC) */
app.get(
  "/api/prestations/pro/:id",
  async (req: Request, res: Response) => {
    try {
      const proId = parseParamToInt(req.params.id);

      const [rows] = await db.query(
        `SELECT id, name, description, price, duration_minutes, active
         FROM prestations
         WHERE pro_id = ?
         ORDER BY name ASC`,
        [proId]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error("Error fetching prestations:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    }
  }
);

/* ============================================
   SLOTS & AVAILABILITY ROUTES
   ============================================ */

// GET: Récupérer les créneaux disponibles pour un pro sur une date donnée
app.get(
  "/api/slots/available/:proId/:date",
  async (req: Request, res: Response) => {
    try {
      const proId = parseParamToInt(req.params.id);
      const dateStr = req.params.date; // Format: YYYY-MM-DD

      const startOfDay = `${dateStr} 00:00:00`;
      const endOfDay = `${dateStr} 23:59:59`;

      // Récupérer les slots disponibles
      const [availableSlots] = await db.query(
        `SELECT id, start_datetime, end_datetime, duration
         FROM slots
         WHERE pro_id = ? 
         AND status = 'available'
         AND start_datetime BETWEEN ? AND ?
         ORDER BY start_datetime ASC`,
        [proId, startOfDay, endOfDay]
      );

      // Formater les créneaux horaires uniquement (HH:MM)
      const formattedSlots = (availableSlots as any[]).map(slot => {
        const time = new Date(slot.start_datetime).toTimeString().slice(0, 5);
        return {
          id: slot.id,
          time: time,
          duration: slot.duration,
          start_datetime: slot.start_datetime,
          end_datetime: slot.end_datetime
        };
      });

      res.json({ success: true, data: formattedSlots });
    } catch (error) {
      console.error("Error fetching available slots:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// GET: Récupérer tous les slots d'un pro (pour gestion côté pro)
app.get(
  "/api/slots/pro/:proId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = parseParamToInt(req.params.id);

      // Vérifier que c'est bien le pro qui demande ses slots
      if (req.user?.id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      const [slots] = await db.query(
        `SELECT id, start_datetime, end_datetime, status, duration
         FROM slots
         WHERE pro_id = ?
         AND start_datetime >= NOW()
         ORDER BY start_datetime ASC`,
        [proId]
      );

      res.json({ success: true, data: slots });
    } catch (error) {
      console.error("Error fetching pro slots:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// POST: Créer des slots (génération automatique ou manuelle)
app.post(
  "/api/slots/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = req.user?.id;
      const { start_datetime, end_datetime, duration } = req.body;

      if (!start_datetime || !end_datetime) {
        return res.status(400).json({
          success: false,
          message: "Dates de début et fin requises"
        });
      }

      // Insérer le slot
      const [result] = await db.query(
        `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [proId, start_datetime, end_datetime, duration || 60]
      );

      res.json({
        success: true,
        message: "Créneau créé",
        data: { id: (result as any).insertId }
      });
    } catch (error) {
      console.error("Error creating slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// PATCH: Bloquer un slot
app.patch(
  "/api/slots/:slotId/block",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const slotId = parseParamToInt(req.params.id);
      const proId = req.user?.id;

      // Vérifier que le slot appartient au pro
      const [slots] = await db.query(
        `SELECT pro_id FROM slots WHERE id = ?`,
        [slotId]
      );

      if ((slots as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Créneau introuvable"
        });
      }

      if ((slots as any[])[0].pro_id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      // Bloquer le slot
      await db.query(
        `UPDATE slots SET status = 'blocked' WHERE id = ?`,
        [slotId]
      );

      res.json({
        success: true,
        message: "Créneau bloqué"
      });
    } catch (error) {
      console.error("Error blocking slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// DELETE: Supprimer un slot
app.delete(
  "/api/slots/:slotId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const slotId = parseParamToInt(req.params.id);
      const proId = req.user?.id;

      // Vérifier que le slot appartient au pro
      const [slots] = await db.query(
        `SELECT pro_id FROM slots WHERE id = ?`,
        [slotId]
      );

      if ((slots as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Créneau introuvable"
        });
      }

      if ((slots as any[])[0].pro_id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      // Supprimer le slot
      await db.query(`DELETE FROM slots WHERE id = ?`, [slotId]);

      res.json({
        success: true,
        message: "Créneau supprimé"
      });
    } catch (error) {
      console.error("Error deleting slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// ==========================================
// AUTH ROUTES
// ==========================================

/* AUTH SIGNUP */
app.post(
  "/api/auth/signup",
  async (req: Request<{}, {}, SignupRequestBody>, res: Response) => {
    let connection;
    try {
      const {
        first_name,
        last_name,
        email,
        password,
        phone_number,
        birth_date,
        role,
        activity_name,
        city,
        instagram_account,
      } = req.body;

      // ✅ Validation stricte AVANT toute opération DB
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: email and password",
          error: "missing_fields"
        });
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
          error: "invalid_email"
        });
      }

      if (trimmedEmail.length > 254) {
        return res.status(400).json({
          success: false,
          message: "Email too long",
          error: "invalid_email"
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
          error: "weak_password"
        });
      }

      if (password.length > 128) {
        return res.status(400).json({
          success: false,
          message: "Password too long",
          error: "invalid_password"
        });
      }

      // ✅ Validation force du mot de passe
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
        return res.status(400).json({
          success: false,
          message: "Password must contain at least one lowercase, one uppercase and one number",
          error: "weak_password"
        });
      }

      // ✅ Validation âge si fourni
      if (birth_date) {
        const birthDateObj = new Date(birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const monthDiff = today.getMonth() - birthDateObj.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
          age--;
        }

        if (age < 16) {
          return res.status(400).json({
            success: false,
            message: "You must be at least 16 years old",
            error: "age_restriction"
          });
        }
      }

      // ✅ Validation téléphone si fourni
      if (phone_number) {
        const cleanPhone = phone_number.replace(/\s/g, "");
        if (!/^[0-9]{10}$/.test(cleanPhone)) {
          return res.status(400).json({
            success: false,
            message: "Invalid phone number format",
            error: "invalid_phone"
          });
        }
      }

      connection = await db.getConnection();

      await connection.beginTransaction();

      try {
        const [existing] = await connection.query(
          "SELECT id FROM users WHERE email = ?",
          [trimmedEmail]
        ) as [any[], any];

        if (existing.length > 0) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message: "Email already exists",
            error: "email_exists"
          });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // ✅ Insertion de l'utilisateur
        const [result] = await connection.execute(
          `INSERT INTO users
           (first_name, last_name, email, phone_number, birth_date, password_hash, role, activity_name, city, instagram_account, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            first_name?.trim() || null,
            last_name?.trim() || null,
            trimmedEmail,
            phone_number?.replace(/\s/g, "") || null,
            birth_date || null,
            passwordHash,
            role === "pro" ? "pro" : "client",
            role === "pro" && activity_name?.trim() ? activity_name.trim() : null,
            role === "pro" && city?.trim() ? city.trim() : null,
            role === "pro" && instagram_account?.trim() ? instagram_account.trim() : null,
          ]
        ) as [any, any];

        const userId = result.insertId;

        console.log(`✅ User created with ID: ${userId} (${trimmedEmail})`);

        await connection.commit();

        res.json({
          success: true,
          message: "Account created successfully"
        });

      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      }

    } catch (err: any) {
      console.error("❌ Signup error:", err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
          error: "email_exists"
        });
      }

      if (err.code === 'ER_DATA_TOO_LONG') {
        return res.status(400).json({
          success: false,
          message: "One or more fields are too long",
          error: "data_too_long"
        });
      }

      res.status(500).json({
        success: false,
        message: "Signup failed due to server error",
        error: "server_error"
      });

    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/* GET USER PROFILE */
app.get(
  "/api/auth/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Non authentifié",
        });
      }

      const [rows] = await db.query(
        `SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          phone_number, 
          birth_date, 
          role, 
          activity_name, 
          city, 
          instagram_account, 
          profile_photo, 
          banner_photo, 
          bio, 
          profile_visibility, 
          pro_status, 
          bankaccountname,
          IBAN,
          accept_online_payment,
          created_at
        FROM users 
        WHERE id = ?`,
        [userId]
      );

      const users = rows as any[];

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur non trouvé",
        });
      }

      const user = users[0];

      let clients_count = 0;
      let avg_rating = null;
      let years_on_blyss = 0;

      try {
        const [clientRows] = await db.query(
          `SELECT COUNT(DISTINCT client_id) as count 
           FROM reservations 
           WHERE pro_id = ? AND status = 'completed'`,
          [userId]
        );
        clients_count = (clientRows as any[])[0]?.count || 0;

        const [ratingRows] = await db.query(
          `SELECT AVG(rating) as avg 
           FROM reviews 
           WHERE pro_id = ?`,
          [userId]
        );
        avg_rating = (ratingRows as any[])[0]?.avg || null;

        const [durationRows] = await db.query(
          `SELECT TIMESTAMPDIFF(YEAR, created_at, NOW()) as years
           FROM users WHERE id = ?`,
          [userId]
        );
        years_on_blyss = (durationRows as any[])[0]?.years || 0;
      } catch (statsError) {
        console.warn("⚠️ Erreur calcul stats (non bloquant):", statsError);
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone_number: user.phone_number,
          birth_date: user.birth_date,
          role: user.role,
          activity_name: user.activity_name,
          city: user.city,
          instagram_account: user.instagram_account,
          profile_photo: user.profile_photo,
          banner_photo: user.banner_photo,
          bio: user.bio,
          profile_visibility: user.profile_visibility || "public",
          pro_status: user.pro_status,
          clients_count,
          avg_rating,
          years_on_blyss,
          bankaccountname: user.bankaccountname,
          IBAN: user.IBAN,
          accept_online_payment: user.accept_online_payment,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      console.error("❌ Get profile error:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/* AUTH LOGIN */
app.post(
  "/api/auth/login",
  async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: "missing_fields" });
      }

      const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [
        email,
      ]);
      const user = (rows as User[])[0];

      if (!user) {
        return res.status(404).json({ success: false, error: "user_not_found" });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ success: false, error: "invalid_password" });
      }

      const { password_hash, ...userWithoutPassword } = user;

      const accessToken = generateAccessToken(user.id);
      const refreshToken = await generateAndStoreRefreshToken(user.id);

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: userWithoutPassword,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "login_failed" });
    }
  }
);

/* AUTH REFRESH */
app.post("/api/auth/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing refresh token" });
    }

    const [rows] = await db.execute(
      `
        SELECT user_id, expires_at, revoked
        FROM refresh_tokens
        WHERE token = ?
        LIMIT 1
      `,
      [refreshToken]
    );

    const record =
      (rows as { user_id: number; expires_at: Date; revoked: number }[])[0];

    if (!record) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    if (record.revoked) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token revoked" });
    }

    const now = new Date();
    const expiresAt = new Date(record.expires_at);
    if (expiresAt <= now) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const newAccessToken = generateAccessToken(record.user_id);
    const newRefreshToken = await generateAndStoreRefreshToken(record.user_id);
    await revokeRefreshToken(refreshToken);

    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* AUTH LOGOUT */
app.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing refresh token" });
    }

    await revokeRefreshToken(refreshToken);

    return res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ==========================================
// USER ROUTES
// ==========================================

/* GET CURRENT USER + STATS */
app.get(
  "/api/users",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [userRows] = await db.execute("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);
      const user = (userRows as User[])[0];
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      let decryptedBankData: any = {};
      if (user.IBAN) {
        try {
          const plainIban = decryptSensitiveData(user.IBAN as string);
          decryptedBankData.IBAN = plainIban.replace(/.(?=.{4})/g, "•");
        } catch (err) {
          console.error("Error decrypting IBAN:", err);
          decryptedBankData.IBAN = null;
        }
      }

      if (user.bankaccountname) {
        try {
          decryptedBankData.bankaccountname = decryptSensitiveData(
            user.bankaccountname as string
          );
        } catch (err) {
          console.error("Error decrypting bank account name:", err);
          decryptedBankData.bankaccountname = null;
        }
      }

      const [clientsRows] = await db.execute(
        `
        SELECT COUNT(DISTINCT client_id) AS clients_count
        FROM reservations
        WHERE pro_id = ?
          AND status = 'completed'
        `,
        [userId]
      );
      const clients_count = Number(
        (clientsRows as any[])[0]?.clients_count ?? 0
      );

      const [ratingRows] = await db.execute(
        `
        SELECT AVG(rating) AS avg_rating
        FROM reviews
        WHERE pro_id = ?
        `,
        [userId]
      );
      const avg_rating_raw = (ratingRows as any[])[0]?.avg_rating;
      const avg_rating =
        avg_rating_raw !== null && avg_rating_raw !== undefined
          ? Number(avg_rating_raw)
          : 0;

      const [durationRows] = await db.execute(
        `
        SELECT
          TIMESTAMPDIFF(YEAR, created_at, CURDATE()) AS diff_years,
          TIMESTAMPDIFF(MONTH, created_at, CURDATE()) AS diff_months
        FROM users
        WHERE id = ?
        `,
        [userId]
      );

      const durationRow = (durationRows as any[])[0];
      const diffYears = Number(durationRow?.diff_years ?? 0);
      const diffMonthsTotal = Number(durationRow?.diff_months ?? 0);

      let years_on_blyss: string;

      if (diffYears >= 1) {
        const remainingMonths = diffMonthsTotal % 12;
        years_on_blyss =
          remainingMonths > 0
            ? `${diffYears} an${diffYears > 1 ? "s" : ""} et ${remainingMonths} mois`
            : `${diffYears} an${diffYears > 1 ? "s" : ""}`;
      } else if (diffMonthsTotal >= 1) {
        years_on_blyss = `${diffMonthsTotal} mois`;
      } else {
        years_on_blyss = "Moins d'1 mois";
      }

      const { password_hash, IBAN, bankaccountname, ...userWithoutSensitive } = user;

      const payload = {
        ...userWithoutSensitive,
        ...decryptedBankData,
        clients_count,
        avg_rating,
        years_on_blyss,
      };

      return res.json({
        success: true,
        data: payload,
      });
    } catch (err) {
      console.error("[/api/users] error =", err);
      return res
        .status(500)
        .json({ success: false, message: "Unable to fetch user" });
    }
  }
);

/* UPLOAD PHOTO */
const uploadDir = path.join(__dirname, "/uploads/profile_photo");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* UPLOAD BANNER - DOSSIER */
const uploadBannerDir = path.join(__dirname, "/uploads/banners");
if (!fs.existsSync(uploadBannerDir)) {
  fs.mkdirSync(uploadBannerDir, { recursive: true });
}


/* STORAGE PROFILE PHOTO */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `pp_${req.user!.id}_${Date.now()}${ext}`);
  },
});

/* STORAGE BANNER */
const storageBanner = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadBannerDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `banner_${req.user!.id}_${Date.now()}${ext}`);
  },
});


const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG and PNG files are allowed"));
  }
};

const upload = multer({ storage, fileFilter });

const uploadBanner = multer({
  storage: storageBanner,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

/* UPLOAD PROFILE PHOTO */
app.post(
  "/api/users/upload-photo",
  authMiddleware,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file || !req.user?.id) {
        return res.status(400).json({
          success: false,
          message: "No file or userId provided"
        });
      }

      // ✅ CORRIGER : Enlever tout ce qui est avant "uploads"
      const photoPath = `uploads/profile_photo/${req.file.filename}`;

      await db.execute("UPDATE users SET profile_photo = ? WHERE id = ?", [
        photoPath,
        req.user.id,
      ]);

      res.json({ success: true, photo: photoPath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  }
);

/* UPLOAD BANNER */
app.post(
  "/api/users/upload-banner",
  authMiddleware,
  uploadBanner.single("banner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Non authentifié"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Aucun fichier fourni"
        });
      }

      const fileUrl = `uploads/banners/${req.file.filename}`;

      await db.query(
        'UPDATE users SET banner_photo = ? WHERE id = ?',
        [fileUrl, userId]
      );

      const [users] = await db.query(
        'SELECT id, email, first_name, last_name, role, city, profile_photo, banner_photo, bio, instagram_account, activity_name FROM users WHERE id = ?',
        [userId]
      ) as any;

      res.json({
        success: true,
        message: "Bannière mise à jour",
        data: users[0]
      });

    } catch (error) {
      console.error("Error uploading banner:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'upload"
      });
    }
  }
);


/* UPDATE USER PROFILE */
app.put(
  "/api/users/update",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        first_name,
        last_name,
        activity_name,
        city,
        instagram_account,
        bio,
        currentPassword,
        newPassword,
      } = req.body;

      const [rows] = await db.execute("SELECT * FROM users WHERE id = ?", [
        req.user!.id,
      ]);
      const user = (rows as User[])[0];

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      let passwordHash = user.password_hash;
      if (newPassword) {
        if (!currentPassword) {
          return res
            .status(400)
            .json({ success: false, message: "Current password required" });
        }
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid current password" });
        }
        if (currentPassword === newPassword) {
          return res.status(400).json({
            success: false,
            message: "New password must be different from current password",
          });
        }
        passwordHash = await bcrypt.hash(newPassword, 12);
      }

      const updatedFirstName =
        first_name !== undefined ? first_name : user.first_name;
      const updatedLastName =
        last_name !== undefined ? last_name : user.last_name;
      const updatedActivityName =
        user.role === "pro"
          ? activity_name !== undefined
            ? activity_name
            : user.activity_name
          : null;
      const updatedCity =
        user.role === "pro"
          ? city !== undefined
            ? city
            : user.city
          : null;
      const updatedInstagramAccount =
        user.role === "pro"
          ? instagram_account !== undefined
            ? instagram_account
            : user.instagram_account
          : null;
      const updatedBio = bio !== undefined ? bio : user.bio;

      await db.execute(
        `UPDATE users
         SET first_name = ?, last_name = ?, activity_name = ?, city = ?, instagram_account = ?, bio = ?, password_hash = ?
         WHERE id = ?`,
        [
          updatedFirstName,
          updatedLastName,
          updatedActivityName,
          updatedCity,
          updatedInstagramAccount,
          updatedBio,
          passwordHash,
          req.user!.id,
        ]
      );

      const [updatedRows] = await db.execute(
        "SELECT * FROM users WHERE id = ?",
        [req.user!.id]
      );
      const updatedUser = (updatedRows as User[])[0];
      const { password_hash, ...userWithoutPassword } = updatedUser;

      res.json({ success: true, data: userWithoutPassword });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Update failed" });
    }
  }
);


/* UPDATE PAYMENTS */
app.put(
  "/api/users/payments",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { bankaccountname, IBAN, accept_online_payment } =
        req.body as UpdatePaymentsBody;

      if (accept_online_payment) {
        if (!bankaccountname || !bankaccountname.trim()) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Le titulaire du compte est requis.",
            });
        }

        if (bankaccountname.trim().length < 2) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Le nom du titulaire doit contenir au moins 2 caractères.",
            });
        }

        if (!IBAN || !IBAN.trim()) {
          return res
            .status(400)
            .json({ success: false, message: "L'IBAN est requis." });
        }

        const formattedIban = electronicFormatIBAN(IBAN);
        if (!isValidIBAN(formattedIban)) {
          return res
            .status(400)
            .json({ success: false, message: "IBAN invalide." });
        }

        const encryptedIban = encryptSensitiveData(formattedIban);
        const encryptedAccountName = encryptSensitiveData(bankaccountname.trim());
        const ibanLast4 = formattedIban.slice(-4);

        const ibanHash = crypto
          .createHash('sha256')
          .update(formattedIban)
          .digest('hex');

        const [existing] = await db.execute(
          `SELECT id FROM users 
           WHERE id != ? 
           AND iban_last4 = ?
           AND SHA2(IBAN, 256) = ?`,
          [userId, ibanLast4, ibanHash]
        );

        if ((existing as any[]).length > 0) {
          return res.status(409).json({
            success: false,
            message: "Cet IBAN est déjà utilisé par un autre compte.",
          });
        }

        await db.execute(
          `
          UPDATE users
          SET 
            bankaccountname = ?, 
            IBAN = ?, 
            iban_last4 = ?,
            accept_online_payment = 1,
            bank_info_updated_at = NOW()
          WHERE id = ?
        `,
          [encryptedAccountName, encryptedIban, ibanLast4, userId]
        );
      } else {
        await db.execute(
          `
          UPDATE users
          SET accept_online_payment = 0
          WHERE id = ?
        `,
          [userId]
        );
      }

      const [rows] = await db.execute(
        `SELECT bankaccountname, IBAN, iban_last4, accept_online_payment 
         FROM users WHERE id = ?`,
        [userId]
      );
      const record = (rows as any[])[0];

      let maskedIban: string | null = null;
      let accountHolderName: string | null = null;

      if (record.IBAN) {
        try {
          const plainIban = decryptSensitiveData(record.IBAN as string);
          maskedIban = plainIban.replace(/.(?=.{4})/g, "•");
        } catch (err) {
          console.error("Error decrypting IBAN:", err);
          maskedIban = null;
        }
      }

      if (record.bankaccountname) {
        try {
          accountHolderName = decryptSensitiveData(record.bankaccountname as string);
        } catch (err) {
          console.error("Error decrypting account name:", err);
          accountHolderName = null;
        }
      }

      res.json({
        success: true,
        data: {
          bankaccountname: accountHolderName,
          IBAN: maskedIban,
          iban_last4: record.iban_last4,
          accept_online_payment: Boolean(record.accept_online_payment),
        },
      });
    } catch (err) {
      console.error("Payment update error:", err);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la mise à jour des paiements.",
      });
    }
  }
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==========================================
// PUBLIC ROUTES - SPECIALISTS
// ==========================================

/* GET ALL ACTIVE PROS (PUBLIC) */
app.get(
  "/api/users/pros",
  async (req: Request, res: Response) => {
    let connection;
    try {
      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name,
          u.city,
          u.instagram_account,
          u.profile_photo,
          u.banner_photo,
          u.bio,
          u.pro_status,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(DISTINCT r.id) as reviews_count
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        WHERE u.role = 'pro' AND u.pro_status = 'active'
        GROUP BY u.id
        ORDER BY avg_rating DESC, reviews_count DESC
        `
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching pros:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des professionnels",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET REVIEWS BY PRO (PUBLIC) */
app.get(
  "/api/reviews/pro/:proId",
  async (req: Request, res: Response) => {
    let connection;
    try {
      const proId = parseParamToInt(req.params.id);

      if (isNaN(proId) || proId <= 0) {
        console.warn(`⚠️ ID invalide reçu: ${req.params.proId}`);
        return res.status(400).json({
          success: false,
          message: "ID du professionnel invalide"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT 
          id,
          pro_id,
          client_id,
          rating,
          comment,
          created_at
         FROM reviews
         WHERE pro_id = ?
         ORDER BY created_at DESC`,
        [proId]
      );

      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error("❌ Error fetching reviews:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des avis"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);


// ==========================================
// SUBSCRIPTION ROUTES
// ==========================================

/* CREATE SUBSCRIPTION */
app.post(
  "/api/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      const {
        plan,
        billingType,
        monthlyPrice,
        totalPrice,
        commitmentMonths,
        startDate,
        endDate,
        status,
        paymentId,
      } = req.body;

      if (!plan || !billingType || !monthlyPrice || !startDate) {
        return res.status(400).json({
          success: false,
          message: "Champs requis manquants"
        });
      }

      if (status === "active" && !paymentId) {
        return res.status(400).json({
          success: false,
          message: "ID de paiement requis pour un abonnement actif"
        });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        await connection.execute(
          `
          UPDATE subscriptions
          SET status = 'cancelled'
          WHERE client_id = ?
            AND status = 'active'
          `,
          [userId]
        );

        const [result] = await connection.execute(
          `
          INSERT INTO subscriptions
            (client_id, plan, billing_type, monthly_price, total_price, 
             commitment_months, start_date, end_date, status, payment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId,
            plan,
            billingType,
            monthlyPrice,
            totalPrice ?? null,
            commitmentMonths ?? null,
            startDate,
            endDate ?? null,
            status || "active",
            paymentId ?? null,
          ]
        );

        if (status === "active" || !status) {
          await connection.execute(
            `UPDATE users SET pro_status = 'active' WHERE id = ?`,
            [userId]
          );
        }

        await connection.commit();

        const insertResult = result as any;
        const subscriptionId = insertResult.insertId;

        res.status(201).json({
          success: true,
          data: {
            id: subscriptionId,
            subscriptionId,
            status: status || "active"
          },
          message: "Abonnement créé avec succès"
        });

      } catch (err) {
        await connection.rollback();
        throw err;
      }

    } catch (error) {
      console.error("Erreur lors de la création de l'abonnement:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la création de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET CURRENT SUBSCRIPTION */
app.get(
  "/api/subscriptions/current",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: "Aucun abonnement actif"
        });
      }

      const subscription = rows[0];

      res.json({
        success: true,
        data: {
          id: subscription.id,
          plan: subscription.plan,
          billingType: subscription.billing_type,
          status: subscription.status,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
          monthlyPrice: subscription.monthly_price,
          totalPrice: subscription.total_price,
          commitmentMonths: subscription.commitment_months,
          createdAt: subscription.created_at
        }
      });

    } catch (error) {
      console.error("Erreur lors de la récupération de l'abonnement:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* CANCEL SUBSCRIPTION */
app.patch(
  "/api/subscriptions/:id/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const subscriptionId = Number(req.params.id);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT id, status
        FROM subscriptions
        WHERE id = ? AND client_id = ?
        `,
        [subscriptionId, userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Abonnement non trouvé"
        });
      }

      await connection.execute(
        `
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [subscriptionId]
      );

      await connection.execute(
        `UPDATE users SET pro_status = 'inactive' WHERE id = ?`,
        [userId]
      );

      res.json({
        success: true,
        message: "Abonnement annulé avec succès"
      });

    } catch (error) {
      console.error("Erreur lors de l'annulation:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'annulation de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SUBSCRIPTION HISTORY */
app.get(
  "/api/subscriptions/history",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
        ORDER BY created_at DESC
        `,
        [userId]
      );

      res.json({
        success: true,
        data: rows
      });

    } catch (error) {
      console.error("Erreur lors de la récupération de l'historique:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// PRO DASHBOARD ROUTES
// ==========================================

/* PRO DASHBOARD */
app.get(
  "/api/pro/dashboard",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [thisWeekRows] = (await connection.query(
        `
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ count: number }[], any];
      const servicesThisWeek = thisWeekRows[0]?.count ?? 0;

      const [lastWeekRows] = (await connection.query(
        `
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1) - 1
        `,
        [proId]
      )) as [{ count: number }[], any];
      const servicesLastWeek = lastWeekRows[0]?.count ?? 0;

      let change = 0;
      let isUp = true;
      if (servicesLastWeek > 0) {
        change = Math.round(
          ((servicesThisWeek - servicesLastWeek) / servicesLastWeek) * 100
        );
        isUp = change >= 0;
        change = Math.abs(change);
      }

      const [todayRows] = (await connection.query(
        `
        SELECT IFNULL(SUM(price), 0) AS total
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND DATE(start_datetime) = CURDATE()
        `,
        [proId]
      )) as [{ total: number | null }[], any];
      const todayForecast = Number(todayRows[0]?.total ?? 0);

      const [upcomingRows] = (await connection.query(
        `
        SELECT
          r.id,
          CONCAT(u.first_name, ' ', u.last_name) AS client_name,
          p.name AS prestation_name,
          DATE_FORMAT(r.start_datetime, '%H:%i') AS start_time,
          r.price,
          r.status
        FROM reservations r
        JOIN users u ON u.id = r.client_id
        JOIN prestations p ON p.id = r.prestation_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND r.start_datetime >= NOW()
        ORDER BY r.start_datetime ASC
        LIMIT 3
        `,
        [proId]
      )) as [any[], any];

      const upcomingClients = upcomingRows.map((row) => {
        const initials = row.client_name
          .split(" ")
          .filter(Boolean)
          .map((part: string) => part[0]?.toUpperCase())
          .join("")
          .slice(0, 2);

        const status =
          row.status === "confirmed"
            ? "upcoming"
            : row.status === "completed"
              ? "completed"
              : "upcoming";

        return {
          id: row.id,
          name: row.client_name,
          service: row.prestation_name,
          time: row.start_time,
          price: Number(row.price),
          status,
          avatar: initials
        };
      });

      const [slotsRows] = (await connection.query(
        `
        SELECT COUNT(*) AS total_slots
        FROM slots
        WHERE pro_id = ?
          AND status = 'open'
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ total_slots: number }[], any];
      const totalSlots = slotsRows[0]?.total_slots ?? 0;

      const [bookedRows] = (await connection.query(
        `
        SELECT COUNT(DISTINCT r.slot_id) AS booked_slots
        FROM reservations r
        JOIN slots s ON s.id = r.slot_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND YEARWEEK(s.start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ booked_slots: number }[], any];
      const bookedSlots = bookedRows[0]?.booked_slots ?? 0;

      let fillRate = 0;
      if (totalSlots > 0) {
        fillRate = Math.round((bookedSlots / totalSlots) * 100);
      }

      const [clientsWeekRows] = (await connection.query(
        `
        SELECT COUNT(DISTINCT client_id) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ count: number }[], any];
      const clientsThisWeek = clientsWeekRows[0]?.count ?? 0;

      const [topServicesRows] = (await connection.query(
        `
        SELECT
          p.name AS prestation_name,
          COUNT(*) AS count
        FROM reservations r
        JOIN prestations p ON p.id = r.prestation_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND r.start_datetime >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY p.id, p.name
        ORDER BY count DESC
        LIMIT 5
        `,
        [proId]
      )) as [{ prestation_name: string; count: number }[], any];

      const totalTopCount = topServicesRows.reduce(
        (acc, row) => acc + Number(row.count),
        0
      );

      const topServices = topServicesRows.map((row) => ({
        name: row.prestation_name,
        percentage:
          totalTopCount > 0
            ? Math.round((Number(row.count) / totalTopCount) * 100)
            : 0
      }));

      const [indexedRevenueRows] = (await connection.query(
        `
        SELECT
          jour,
          total,
          DAYOFWEEK(jour) AS dayOfWeek
        FROM (
          SELECT
            DATE(start_datetime) AS jour,
            SUM(price) AS total
          FROM reservations
          WHERE pro_id = ?
            AND status IN ('confirmed', 'completed')
            AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
          GROUP BY DATE(start_datetime)
        ) AS t
        ORDER BY jour
        `,
        [proId]
      )) as [{ jour: string; total: number | null; dayOfWeek: number }[], any];

      const weeklyRevenue = indexedRevenueRows.map((row) => {
        const dow = row.dayOfWeek;
        let label = "";
        switch (dow) {
          case 2:
            label = "Lun";
            break;
          case 3:
            label = "Mar";
            break;
          case 4:
            label = "Mer";
            break;
          case 5:
            label = "Jeu";
            break;
          case 6:
            label = "Ven";
            break;
          case 7:
            label = "Sam";
            break;
          case 1:
          default:
            label = "Dim";
            break;
        }

        return {
          day: label,
          amount: Number(row.total ?? 0),
        };
      });

      const responseBody = {
        weeklyStats: {
          services: servicesThisWeek,
          change,
          isUp
        },
        todayForecast,
        upcomingClients,
        fillRate,
        clientsThisWeek,
        topServices,
        weeklyRevenue
      };

      res.json(responseBody);
    } catch (err: any) {
      console.error(err);
      if (err.message === "Pro non authentifié") {
        return res.status(401).json({ message: "Non authentifié" });
      }
      res.status(500).json({ message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* PRO CALENDAR */
app.get(
  "/api/pro/calendar",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { from, to } = req.query as { from?: string; to?: string };

      connection = await db.getConnection();

      const params: any[] = [proId];
      let where = "r.pro_id = ? AND r.status IN ('confirmed','completed')";

      if (from) {
        where += " AND DATE(r.start_datetime) >= ?";
        params.push(from);
      }
      if (to) {
        where += " AND DATE(r.start_datetime) <= ?";
        params.push(to);
      }

      const [rows] = (await connection.query(
        `
        SELECT
          r.id,
          DATE(r.start_datetime) AS date,
          DATE_FORMAT(r.start_datetime, '%H:%i') AS time,
          p.duration_minutes AS duration_minutes,
          r.price,
          r.status,
          u.first_name,
          u.last_name,
          p.name AS prestation_name
        FROM reservations r
        JOIN users u ON u.id = r.client_id
        JOIN prestations p ON p.id = r.prestation_id
        WHERE ${where}
        ORDER BY r.start_datetime ASC
        `,
        params
      )) as [any[], any];

      const data = rows.map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        duration: r.duration_minutes,
        price: Number(r.price),
        status: r.status,
        client_name: `${r.first_name} ${r.last_name}`,
        prestation_name: r.prestation_name,
      }));

      res.json({ success: true, data });
    } catch (err) {
      console.error("[CALENDAR] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* PRO CLIENTS */
app.get(
  "/api/pro/clients",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [rows] = (await connection.query(
        `
        SELECT
          c.id,
          CONCAT(c.first_name, ' ', c.last_name) AS name,
          c.phone_number AS phone,
          MAX(r.start_datetime) AS last_visit,
          COUNT(*) AS total_visits,
          n.notes
        FROM reservations r
        JOIN users c ON c.id = r.client_id
        LEFT JOIN pro_client_notes n
          ON n.pro_id = r.pro_id
         AND n.client_id = c.id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed','completed')
        GROUP BY c.id, c.first_name, c.last_name, c.phone_number, n.notes
        ORDER BY last_visit DESC
        `,
        [proId]
      )) as [any[], any];

      const now = new Date();

      const data = rows.map((r) => {
        const last = new Date(r.last_visit);
        const diffMs = now.getTime() - last.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let lastVisitLabel = "";
        if (diffDays === 0) lastVisitLabel = "Aujourd'hui";
        else if (diffDays === 1) lastVisitLabel = "Il y a 1 jour";
        else lastVisitLabel = `Il y a ${diffDays} jours`;

        const initials = r.name
          .split(" ")
          .filter(Boolean)
          .map((p: string) => p[0]?.toUpperCase())
          .join("")
          .slice(0, 2);

        return {
          id: r.id,
          name: r.name,
          phone: r.phone || "",
          lastVisit: lastVisitLabel,
          totalVisits: Number(r.total_visits),
          notes: r.notes || "",
          avatar: initials,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE CLIENT NOTES */
app.put(
  "/api/pro/clients/:clientId/notes",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const clientId = Number(req.params.clientId);
      const { notes } = req.body as { notes: string };

      if (!clientId || Number.isNaN(clientId)) {
        return res
          .status(400)
          .json({ success: false, message: "Client invalide" });
      }

      connection = await db.getConnection();

      await connection.query(
        `
        INSERT INTO pro_client_notes (pro_id, client_id, notes)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE notes = VALUES(notes)
        `,
        [proId, clientId, notes]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Update client notes error:", err);
      res
        .status(500)
        .json({ success: false, message: "Erreur lors de la mise à jour des notes" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET PRO SUBSCRIPTION */
app.get(
  "/api/pro/subscription",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [rows] = (await connection.query(
        `
        SELECT
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [proId]
      )) as any[];

      if (!rows.length) {
        return res.json({ success: true, data: null });
      }

      const sub = rows[0];

      res.json({
        success: true,
        data: {
          id: sub.id,
          plan: sub.plan,
          billingType: sub.billing_type,
          monthlyPrice: sub.monthly_price,
          totalPrice: sub.total_price,
          commitmentMonths: sub.commitment_months,
          startDate: sub.start_date,
          endDate: sub.end_date,
          status: sub.status,
        },
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* CANCEL PRO SUBSCRIPTION */
app.put(
  "/api/pro/subscription/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [rows] = (await connection.query(
        `
        SELECT id
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [proId]
      )) as any[];

      if (!rows.length) {
        return res.json({ success: false, message: "Aucun abonnement actif." });
      }

      const subscriptionId = rows[0].id;

      await connection.query(
        `
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [subscriptionId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur lors de la résiliation." });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// NOTIFICATION SETTINGS - CLIENT
// ==========================================

/* GET CLIENT NOTIFICATION SETTINGS */
app.get(
  "/api/client/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT * FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        const defaultSettings = {
          user_id: userId,
          reminders: 1,
          changes: 1,
          messages: 1,
          late: 1,
          offers: 1,
          email_summary: 0
        };

        await connection.query(
          `INSERT INTO client_notification_settings SET ?`,
          [defaultSettings]
        );

        return res.status(200).json({
          success: true,
          data: {
            reminders: true,
            changes: true,
            messages: true,
            late: true,
            offers: true,
            email_summary: false
          },
          message: "Préférences initialisées avec les valeurs par défaut"
        });
      }

      const settings = rows[0];
      res.status(200).json({
        success: true,
        data: {
          reminders: Boolean(settings.reminders),
          changes: Boolean(settings.changes),
          messages: Boolean(settings.messages),
          late: Boolean(settings.late),
          offers: Boolean(settings.offers),
          email_summary: Boolean(settings.email_summary)
        }
      });

    } catch (error) {
      console.error("Erreur lors de la récupération des préférences:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des préférences"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE CLIENT NOTIFICATION SETTINGS */
app.put(
  "/api/client/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      const {
        reminders,
        changes,
        messages,
        late,
        offers,
        email_summary
      } = req.body;

      const fields = { reminders, changes, messages, late, offers, email_summary };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && typeof value !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `Le champ ${key} doit être un booléen`
          });
        }
      }

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT user_id FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO client_notification_settings 
           (user_id, reminders, changes, messages, late, offers, email_summary) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            reminders !== undefined ? (reminders ? 1 : 0) : 1,
            changes !== undefined ? (changes ? 1 : 0) : 1,
            messages !== undefined ? (messages ? 1 : 0) : 1,
            late !== undefined ? (late ? 1 : 0) : 1,
            offers !== undefined ? (offers ? 1 : 0) : 1,
            email_summary !== undefined ? (email_summary ? 1 : 0) : 0
          ]
        );
      } else {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined) {
            updateFields.push(`${key} = ?`);
            updateValues.push(value ? 1 : 0);
          }
        });

        if (updateFields.length > 0) {
          updateValues.push(userId);
          await connection.query(
            `UPDATE client_notification_settings 
             SET ${updateFields.join(", ")}, updated_at = NOW() 
             WHERE user_id = ?`,
            updateValues
          );
        }
      }

      const [updated] = await connection.query(
        `SELECT * FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      res.status(200).json({
        success: true,
        data: {
          reminders: Boolean(updated[0].reminders),
          changes: Boolean(updated[0].changes),
          messages: Boolean(updated[0].messages),
          late: Boolean(updated[0].late),
          offers: Boolean(updated[0].offers),
          email_summary: Boolean(updated[0].email_summary)
        },
        message: "Préférences mises à jour avec succès"
      });

    } catch (error) {
      console.error("Erreur lors de la mise à jour des préférences:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// NOTIFICATION SETTINGS - PRO
// ==========================================

/* GET PRO NOTIFICATION SETTINGS */
app.get(
  "/api/pro/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT * FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        const defaultSettings = {
          user_id: userId,
          new_reservation: 1,
          cancel_change: 1,
          daily_reminder: 1,
          client_message: 1,
          payment_alert: 1,
          activity_summary: 0
        };

        await connection.query(
          `INSERT INTO pro_notification_settings SET ?`,
          [defaultSettings]
        );

        return res.status(200).json({
          success: true,
          data: {
            new_reservation: true,
            cancel_change: true,
            daily_reminder: true,
            client_message: true,
            payment_alert: true,
            activity_summary: false
          }
        });
      }

      const settings = rows[0];
      res.status(200).json({
        success: true,
        data: {
          new_reservation: Boolean(settings.new_reservation),
          cancel_change: Boolean(settings.cancel_change),
          daily_reminder: Boolean(settings.daily_reminder),
          client_message: Boolean(settings.client_message),
          payment_alert: Boolean(settings.payment_alert),
          activity_summary: Boolean(settings.activity_summary)
        }
      });

    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE PRO NOTIFICATION SETTINGS */
app.put(
  "/api/pro/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      const {
        new_reservation,
        cancel_change,
        daily_reminder,
        client_message,
        payment_alert,
        activity_summary
      } = req.body;

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT user_id FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO pro_notification_settings 
           (user_id, new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            new_reservation !== undefined ? (new_reservation ? 1 : 0) : 1,
            cancel_change !== undefined ? (cancel_change ? 1 : 0) : 1,
            daily_reminder !== undefined ? (daily_reminder ? 1 : 0) : 1,
            client_message !== undefined ? (client_message ? 1 : 0) : 1,
            payment_alert !== undefined ? (payment_alert ? 1 : 0) : 1,
            activity_summary !== undefined ? (activity_summary ? 1 : 0) : 0
          ]
        );
      } else {
        const fields = { new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary };
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined) {
            updateFields.push(`${key} = ?`);
            updateValues.push(value ? 1 : 0);
          }
        });

        if (updateFields.length > 0) {
          updateValues.push(userId);
          await connection.query(
            `UPDATE pro_notification_settings 
             SET ${updateFields.join(", ")}, updated_at = NOW() 
             WHERE user_id = ?`,
            updateValues
          );
        }
      }

      const [updated] = await connection.query(
        `SELECT * FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      res.status(200).json({
        success: true,
        data: {
          new_reservation: Boolean(updated[0].new_reservation),
          cancel_change: Boolean(updated[0].cancel_change),
          daily_reminder: Boolean(updated[0].daily_reminder),
          client_message: Boolean(updated[0].client_message),
          payment_alert: Boolean(updated[0].payment_alert),
          activity_summary: Boolean(updated[0].activity_summary)
        }
      });

    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// SLOTS MANAGEMENT
// ==========================================

/* CREATE SLOT */
app.post(
  "/api/pro/slots",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { date, time, duration = 60 } = req.body;

      if (!date || !time) {
        return res.status(400).json({
          success: false,
          error: "Date et heure requises"
        });
      }

      const startDatetime = `${date} ${time}:00`;

      connection = await db.getConnection();

      console.log("Creating slot:", { proId, startDatetime, duration });

      await connection.query(
        `
        INSERT INTO slots (
          pro_id, 
          start_datetime, 
          end_datetime, 
          duration, 
          status, 
          created_at
        )
        VALUES (
          ?, 
          ?, 
          DATE_ADD(?, INTERVAL ? MINUTE), 
          ?, 
          'available', 
          NOW()
        )
        `,
        [proId, startDatetime, startDatetime, duration, duration]
      );

      res.json({ success: true, message: "Créneau créé" });
    } catch (err) {
      console.error("[CREATE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SLOTS */
app.get(
  "/api/pro/slots",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { date } = req.query as { date?: string };

      if (!date) {
        return res.status(400).json({ success: false, error: "Date requise" });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT
          id,
          DATE_FORMAT(start_datetime, '%H:%i') AS time,
          duration,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 'past'
            ELSE status
          END AS computed_status,
          status AS original_status,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 0
            WHEN status = 'available' THEN 1
            ELSE 0
          END AS isActive,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 0
            WHEN status = 'available' THEN 1
            WHEN status = 'booked' THEN 0
            ELSE 1
          END AS isAvailable
        FROM slots
        WHERE pro_id = ?
          AND DATE(start_datetime) = ?
        ORDER BY start_datetime ASC
        `,
        [proId, date]
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET SLOTS] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE SLOT */
app.patch(
  "/api/pro/slots/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const slotId = parseInt(String(req.params.id));
      const { status } = req.body;

      if (!status || !['available', 'blocked'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Status invalide"
        });
      }

      connection = await db.getConnection();

      await connection.query(
        `
        UPDATE slots 
        SET status = ?
        WHERE id = ? AND pro_id = ?
        `,
        [status, slotId, proId]
      );

      res.json({ success: true, message: "Créneau mis à jour" });
    } catch (err) {
      console.error("[UPDATE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* DELETE SLOT */
app.delete(
  "/api/pro/slots/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const slotId = parseInt(String(req.params.id));

      connection = await db.getConnection();

      await connection.query(
        `
        DELETE FROM slots 
        WHERE id = ? AND pro_id = ?
        `,
        [slotId, proId]
      );

      res.json({ success: true, message: "Créneau supprimé" });
    } catch (err) {
      console.error("[DELETE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// CLIENT - SPECIALISTS ROUTES
// ==========================================

/* GET ALL SPECIALISTS */
app.get(
  "/api/client/specialists",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const { limit = 50, page = 1, search = "", city = "" } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      connection = await db.getConnection();

      let whereClause = "WHERE u.role = 'pro' AND u.pro_status = 'active'";
      const params: any[] = [];

      if (search) {
        whereClause += ` AND (
          u.activity_name LIKE ? OR 
          u.first_name LIKE ? OR 
          u.last_name LIKE ? OR 
          u.city LIKE ?
        )`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      if (city) {
        whereClause += ` AND u.city LIKE ?`;
        params.push(`%${city}%`);
      }

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name as business_name,
          u.city,
          u.profile_photo as profile_image_url,
          u.banner_photo as cover_image_url,
          COALESCE(AVG(r.rating), 0) as rating,
          COUNT(DISTINCT r.id) as reviews_count,
          'Prothésiste ongulaire' as specialty
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        ${whereClause}
        GROUP BY u.id
        ORDER BY rating DESC, reviews_count DESC
        LIMIT ? OFFSET ?
        `,
        [...params, Number(limit), offset]
      );

      const specialists = (rows as any[]).map((row) => ({
        id: row.id,
        business_name: row.business_name || `${row.first_name} ${row.last_name}`,
        specialty: row.specialty,
        city: row.city,
        rating: Number(row.rating),
        reviews_count: Number(row.reviews_count),
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
        user: {
          first_name: row.first_name,
          last_name: row.last_name,
        },
      }));

      res.json({
        success: true,
        data: specialists,
      });
    } catch (error) {
      console.error("Error fetching specialists:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des spécialistes",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SPECIALIST BY ID */
app.get(
  "/api/client/specialists/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const specialistId = parseParamToInt(req.params.id);

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name as business_name,
          u.city,
          u.profile_photo as profile_image_url,
          u.banner_photo as cover_image_url,
          u.bio,
          u.instagram_account,
          COALESCE(AVG(r.rating), 0) as rating,
          COUNT(DISTINCT r.id) as reviews_count,
          'Prothésiste ongulaire' as specialty
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        WHERE u.id = ? AND u.role = 'pro' AND u.pro_status = 'active'
        GROUP BY u.id
        `,
        [specialistId]
      );

      if ((rows as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Spécialiste non trouvée",
        });
      }

      const row = (rows as any[])[0];
      const specialist = {
        id: row.id,
        business_name: row.business_name || `${row.first_name} ${row.last_name}`,
        specialty: row.specialty,
        city: row.city,
        rating: Number(row.rating),
        reviews_count: Number(row.reviews_count),
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
        bio: row.bio,
        instagram_account: row.instagram_account,
        user: {
          first_name: row.first_name,
          last_name: row.last_name,
        },
      };

      res.json({
        success: true,
        data: specialist,
      });
    } catch (error) {
      console.error("Error fetching specialist:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération de la spécialiste",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// PAYMENT METHODS - CLIENT
// ==========================================

/* GET PAYMENT METHODS */
app.get(
  "/api/client/payment-methods",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT id, brand, last4, exp_month, exp_year, cardholder_name, is_default 
         FROM payment_methods 
         WHERE user_id = ? 
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* ADD PAYMENT METHOD */
app.post(
  "/api/client/payment-methods",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const { card_number, cardholder_name, exp_month, exp_year, cvc, set_default } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      // Déterminer la marque
      let brand: "visa" | "mastercard" | "amex" = "visa";
      if (card_number.startsWith("4")) brand = "visa";
      else if (card_number.startsWith("5")) brand = "mastercard";
      else if (card_number.startsWith("3")) brand = "amex";

      const last4 = card_number.slice(-4);

      connection = await db.getConnection();

      // Si set_default, retirer le défaut des autres
      if (set_default) {
        await connection.query(
          `UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`,
          [userId]
        );
      }

      // ⚠️ STOCKAGE EN CLAIR (V1 uniquement)
      await connection.query(
        `INSERT INTO payment_methods 
         (user_id, brand, last4, exp_month, exp_year, cardholder_name, card_number, cvc, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, brand, last4, exp_month, exp_year, cardholder_name, card_number, cvc, set_default ? 1 : 0]
      );

      res.json({ success: true, message: "Carte enregistrée" });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* SET DEFAULT PAYMENT METHOD */
app.put(
  "/api/client/payment-methods/:id/default",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const cardId = parseParamToInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      await connection.query(
        `UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`,
        [userId]
      );

      await connection.query(
        `UPDATE payment_methods SET is_default = 1 WHERE id = ? AND user_id = ?`,
        [cardId, userId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* DELETE PAYMENT METHOD */
app.delete(
  "/api/client/payment-methods/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const cardId = parseParamToInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      await connection.query(
        `DELETE FROM payment_methods WHERE id = ? AND user_id = ?`,
        [cardId, userId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// NOTIFICATION SETTINGS - CLIENT
// ==========================================

/* GET CLIENT NOTIFICATION SETTINGS */
app.get(
  "/api/client/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT 
          reminders, 
          changes, 
          messages, 
          late, 
          offers, 
          email_summary,
          created_at,
          updated_at
         FROM client_notification_settings 
         WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        await connection.query(
          `INSERT INTO client_notification_settings 
           (user_id, reminders, changes, messages, late, offers, email_summary)
           VALUES (?, 1, 1, 1, 1, 1, 0)`,
          [userId]
        );

        return res.json({
          success: true,
          data: {
            reminders: true,
            changes: true,
            messages: true,
            late: true,
            offers: true,
            emailSummary: false
          }
        });
      }

      const settings = rows[0];

      res.json({
        success: true,
        data: {
          reminders: Boolean(settings.reminders),
          changes: Boolean(settings.changes),
          messages: Boolean(settings.messages),
          late: Boolean(settings.late),
          offers: Boolean(settings.offers),
          emailSummary: Boolean(settings.email_summary)
        }
      });

    } catch (error) {
      console.error("❌ Erreur notification-settings GET:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE CLIENT NOTIFICATION SETTINGS */
app.put(
  "/api/client/notification-settings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      const { reminders, changes, messages, late, offers, emailSummary } = req.body;

      const fields = { reminders, changes, messages, late, offers, emailSummary };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && typeof value !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `Le champ '${key}' doit être un booléen`
          });
        }
      }

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT id FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO client_notification_settings 
           (user_id, reminders, changes, messages, late, offers, email_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            reminders ?? true,
            changes ?? true,
            messages ?? true,
            late ?? true,
            offers ?? true,
            emailSummary ?? false
          ]
        );
      } else {
        const updates: string[] = [];
        const values: any[] = [];

        if (reminders !== undefined) {
          updates.push("reminders = ?");
          values.push(reminders);
        }
        if (changes !== undefined) {
          updates.push("changes = ?");
          values.push(changes);
        }
        if (messages !== undefined) {
          updates.push("messages = ?");
          values.push(messages);
        }
        if (late !== undefined) {
          updates.push("late = ?");
          values.push(late);
        }
        if (offers !== undefined) {
          updates.push("offers = ?");
          values.push(offers);
        }
        if (emailSummary !== undefined) {
          updates.push("email_summary = ?");
          values.push(emailSummary);
        }

        if (updates.length > 0) {
          values.push(userId);
          await connection.query(
            `UPDATE client_notification_settings 
             SET ${updates.join(", ")}
             WHERE user_id = ?`,
            values
          );
        }
      }

      const [updated] = await connection.query(
        `SELECT 
          reminders, 
          changes, 
          messages, 
          late, 
          offers, 
          email_summary
         FROM client_notification_settings 
         WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      res.json({
        success: true,
        data: {
          reminders: Boolean(updated[0].reminders),
          changes: Boolean(updated[0].changes),
          messages: Boolean(updated[0].messages),
          late: Boolean(updated[0].late),
          offers: Boolean(updated[0].offers),
          emailSummary: Boolean(updated[0].email_summary)
        }
      });

    } catch (error) {
      console.error("❌ Erreur notification-settings PUT:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);


/* GET MY RESERVATIONS (CLIENT) */
app.get("/api/bookings/my-bookings", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    connection = await db.getConnection();

    const [rows] = await connection.query(
      `SELECT
        r.id,
        r.pro_id,
        r.prestation_id,
        r.slot_id,
        r.status,
        r.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS pro_name,
        u.activity_name AS pro_activity_name,
        u.profile_photo AS pro_profile_photo,
        u.city AS pro_city,
        p.name AS prestation_name,
        p.price AS prestation_price,
        DATE(r.start_datetime) AS slot_date,
        TIME_FORMAT(r.start_datetime, '%H:%i') AS slot_start_time
       FROM reservations r
       LEFT JOIN users u ON u.id = r.pro_id
       LEFT JOIN prestations p ON p.id = r.prestation_id
       WHERE r.client_id = ?
       ORDER BY r.start_datetime DESC`,
      [clientId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des réservations"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* CREATE REVIEW */
app.post("/api/reviews", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;
    const { pro_id, rating, comment } = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    if (!pro_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Données invalides"
      });
    }

    connection = await db.getConnection();

    const [existing] = await connection.query(
      "SELECT id FROM reviews WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      await connection.query(
        "UPDATE reviews SET rating = ?, comment = ? WHERE client_id = ? AND pro_id = ?",
        [rating, comment, clientId, pro_id]
      );
    } else {
      await connection.query(
        "INSERT INTO reviews (client_id, pro_id, rating, comment) VALUES (?, ?, ?, ?)",
        [clientId, pro_id, rating, comment]
      );
    }

    res.json({
      success: true,
      message: "Avis enregistré"
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'enregistrement de l'avis"
    });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================
// CLIENT BOOKING ROUTES
// ============================================

// GET - Récupérer les réservations du client connecté
app.get('/client/my-booking', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  let connection;
  try {
    const clientId = req.user?.id;
    if (!clientId) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    connection = await db.getConnection();

    const rows = await connection.query(`
      SELECT 
        r.id,
        r.pro_id,
        r.prestation_id,
        r.slot_id,
        r.status,
        r.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS pro_name,
        u.activity_name AS pro_activity_name,
        u.profile_photo AS pro_profile_photo,
        u.city AS pro_city,
        p.name AS prestation_name,
        p.price AS prestation_price,
        DATE(r.start_datetime) AS slot_date,
        TIME_FORMAT(r.start_datetime, '%H:%i:%s') AS slot_start_time
      FROM reservations r
      LEFT JOIN users u ON u.id = r.pro_id
      LEFT JOIN prestations p ON p.id = r.prestation_id
      WHERE r.client_id = ?
      ORDER BY r.start_datetime DESC
    `, [clientId]);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error('Error fetching client bookings:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des réservations' });
  } finally {
    if (connection) connection.release();
  }
});


// PUT - Annuler une réservation
app.put('/client/booking/:id/cancel', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  let connection;
  try {
    const clientId = req.user?.id;
    const bookingId = parseParamToInt(req.params.id);

    if (!clientId) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, message: 'ID de réservation invalide' });
    }

    connection = await db.getConnection();

    // Vérifier que la réservation appartient au client
    const [booking]: any = await connection.query(
      'SELECT id, slot_id, status FROM reservations WHERE id = ? AND client_id = ?',
      [bookingId, clientId]
    );

    if (!booking || booking.length === 0) {
      return res.status(404).json({ success: false, message: 'Réservation non trouvée' });
    }

    if (booking[0].status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Réservation déjà annulée' });
    }

    // Commencer une transaction
    await connection.beginTransaction();

    try {
      // Mettre à jour le statut de la réservation
      await connection.query(
        'UPDATE reservations SET status = ? WHERE id = ?',
        ['cancelled', bookingId]
      );

      // Libérer le slot si nécessaire (slot_id peut être NULL selon votre schéma)
      if (booking[0].slot_id) {
        await connection.query(
          'UPDATE slots SET status = ? WHERE id = ?',
          ['available', booking[0].slot_id]
        );
      }

      await connection.commit();

      res.json({ success: true, message: 'Réservation annulée avec succès' });

    } catch (err) {
      await connection.rollback();
      throw err;
    }

  } catch (error) {
    console.error('Error canceling booking:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'annulation' });
  } finally {
    if (connection) connection.release();
  }
});

// GET - Récupérer les détails d'une réservation spécifique
app.get('/client/booking-detail/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  let connection;
  try {
    const clientId = req.user?.id;
    const bookingId = parseParamToInt(req.params.id);

    if (!clientId) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    connection = await db.getConnection();

    const rows = await connection.query(`
      SELECT 
        r.id,
        r.pro_id,
        r.prestation_id,
        r.slot_id,
        r.status,
        r.price,
        r.paid_online,
        r.created_at,
        r.start_datetime,
        r.end_datetime,
        CONCAT(u.first_name, ' ', u.last_name) AS pro_name,
        u.activity_name AS pro_activity_name,
        u.profile_photo AS pro_profile_photo,
        u.city AS pro_city,
        u.instagram_account AS pro_instagram,
        p.name AS prestation_name,
        p.description AS prestation_description,
        p.duration_minutes AS prestation_duration,
        DATE(r.start_datetime) AS slot_date,
        TIME_FORMAT(r.start_datetime, '%H:%i:%s') AS slot_start_time,
        TIME_FORMAT(r.end_datetime, '%H:%i:%s') AS slot_end_time
      FROM reservations r
      LEFT JOIN users u ON u.id = r.pro_id
      LEFT JOIN prestations p ON p.id = r.prestation_id
      WHERE r.id = ? AND r.client_id = ?
    `, [bookingId, clientId]);

    if (!rows || (rows as any).length === 0) {
      return res.status(404).json({ success: false, message: 'Réservation non trouvée' });
    }

    res.json({ success: true, data: (rows as any)[0] });

  } catch (error) {
    console.error('Error fetching booking detail:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des détails' });
  } finally {
    if (connection) connection.release();
  }
});

/* ========================================
   FAVORITES ROUTES
   ======================================== */

/* GET USER FAVORITES */
app.get("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    connection = await db.getConnection();

    const [rows] = await connection.query(
      `SELECT
        f.id,
        f.pro_id,
        f.created_at,
        u.first_name,
        u.last_name,
        u.activity_name,
        u.city,
        u.profile_photo,
        u.banner_photo,
        u.bio,
        u.instagram_account,
        'Prothésiste ongulaire' as specialty,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as reviews_count
       FROM favorites f
       JOIN users u ON u.id = f.pro_id
       LEFT JOIN reviews r ON r.pro_id = f.pro_id
       WHERE f.client_id = ? AND u.pro_status = 'active'
       GROUP BY f.id, f.pro_id, f.created_at, u.first_name, u.last_name,
                u.activity_name, u.city, u.profile_photo, u.banner_photo,
                u.bio, u.instagram_account
       ORDER BY f.created_at DESC`,
      [clientId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* ADD TO FAVORITES */
app.post("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const user = (req as AuthenticatedRequest).user;
    const clientId = user?.id;
    const { pro_id } = req.body;

    console.log("🔐 Add favorite - user:", user, "clientId:", clientId, "pro_id:", pro_id);

    if (!clientId || clientId === undefined || clientId === null) {
      console.log("❌ Client ID missing or invalid");
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    if (!pro_id) {
      return res.status(400).json({
        success: false,
        message: "ID du professionnel requis"
      });
    }

    connection = await db.getConnection();

    const [existing] = await connection.query(
      "SELECT id FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Déjà dans les favoris",
        data: {
          id: (existing[0] as { id: number }).id,
          isFavorite: true
        }
      });
    }

    const [result] = await connection.query(
      "INSERT INTO favorites (client_id, pro_id) VALUES (?, ?)",
      [clientId, pro_id]
    );

    res.json({
      success: true,
      message: "Ajouté aux favoris",
      data: {
        id: (result as { insertId: number }).insertId,
        pro_id: pro_id,
        isFavorite: true
      }
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'ajout aux favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* REMOVE FROM FAVORITES */
app.delete("/api/favorites/:proId", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;
    const proId = parseParamToInt(req.params.id);

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    if (isNaN(proId)) {
      return res.status(400).json({
        success: false,
        message: "ID invalide"
      });
    }

    connection = await db.getConnection();

    const [result] = await connection.query(
      "DELETE FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, proId]
    );

    if ((result as { affectedRows: number }).affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Favori non trouvé",
        data: {
          isFavorite: false
        }
      });
    }

    res.json({
      success: true,
      message: "Retiré des favoris",
      data: {
        isFavorite: false
      }
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* CHECK IF FAVORITE */
app.get("/api/favorites/check/:proId", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;
    const proId = parseParamToInt(req.params.id);

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    if (isNaN(proId)) {
      return res.status(400).json({
        success: false,
        message: "ID invalide"
      });
    }

    connection = await db.getConnection();

    const [rows] = await connection.query(
      "SELECT id FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, proId]
    );

    const isFavorite = Array.isArray(rows) && rows.length > 0;

    res.json({
      success: true,
      data: {
        isFavorite,
        favoriteId: isFavorite ? (rows[0] as { id: number }).id : null
      }
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification"
    });
  } finally {
    if (connection) connection.release();
  }
});


// ==========================================
// CLIENT BOOKINGS ROUTES
// ==========================================

/* GET CLIENT BOOKINGS (Mes réservations) */
app.get(
  "/api/client/my-booking",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const clientId = req.user?.id;

      if (!clientId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      console.log(`📡 Récupération des réservations pour client ${clientId}...`);

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT 
          r.id,
          r.pro_id,
          r.client_id,
          r.prestation_id,
          r.slot_id,
          r.start_datetime,
          r.end_datetime,
          r.status,
          r.price,
          r.paid_online,
          r.created_at,
          u.first_name AS pro_first_name,
          u.last_name AS pro_last_name,
          u.activity_name AS pro_activity_name,
          u.profile_photo AS pro_profile_photo,
          u.city AS pro_city,
          p.name AS prestation_name,
          p.description AS prestation_description,
          p.duration_minutes AS prestation_duration
         FROM reservations r
         JOIN users u ON u.id = r.pro_id
         LEFT JOIN prestations p ON p.id = r.prestation_id
         WHERE r.client_id = ?
         ORDER BY r.start_datetime DESC`,
        [clientId]
      );

      console.log(`✅ ${(rows as any[]).length} réservation(s) trouvée(s)`);

      const bookings = (rows as any[]).map((row: any) => ({
        id: row.id,
        pro: {
          id: row.pro_id,
          name: row.pro_activity_name || `${row.pro_first_name} ${row.pro_last_name}`,
          first_name: row.pro_first_name,
          last_name: row.pro_last_name,
          profile_photo: row.pro_profile_photo,
          city: row.pro_city
        },
        prestation: row.prestation_id ? {
          id: row.prestation_id,
          name: row.prestation_name,
          description: row.prestation_description,
          duration_minutes: row.prestation_duration
        } : null,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
        price: Number(row.price),
        status: row.status,
        paid_online: Boolean(row.paid_online),
        created_at: row.created_at
      }));

      res.json({
        success: true,
        data: bookings
      });

    } catch (error) {
      console.error("❌ Error fetching client bookings:", error);

      if (error instanceof Error) {
        console.error("Message:", error.message);
      }

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des réservations"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SINGLE BOOKING DETAILS */
app.get(
  "/api/client/my-booking/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const clientId = req.user?.id;
      const bookingId = parseParamToInt(req.params.id);

      if (!clientId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      if (isNaN(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "ID de réservation invalide"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT 
          r.id,
          r.pro_id,
          r.prestation_id,
          r.slot_id,
          r.start_datetime,
          r.end_datetime,
          r.status,
          r.price,
          r.paid_online,
          r.created_at,
          u.first_name AS pro_first_name,
          u.last_name AS pro_last_name,
          u.activity_name AS pro_activity_name,
          u.profile_photo AS pro_profile_photo,
          u.banner_photo AS pro_banner_photo,
          u.city AS pro_city,
          u.instagram_account AS pro_instagram,
          u.phone_number AS pro_phone,
          p.name AS prestation_name,
          p.description AS prestation_description,
          p.duration_minutes AS prestation_duration
         FROM reservations r
         JOIN users u ON u.id = r.pro_id
         LEFT JOIN prestations p ON p.id = r.prestation_id
         WHERE r.id = ? AND r.client_id = ?`,
        [bookingId, clientId]
      );

      if ((rows as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Réservation non trouvée"
        });
      }

      const row = (rows as any[])[0];

      const booking = {
        id: row.id,
        pro: {
          id: row.pro_id,
          name: row.pro_activity_name || `${row.pro_first_name} ${row.pro_last_name}`,
          first_name: row.pro_first_name,
          last_name: row.pro_last_name,
          profile_photo: row.pro_profile_photo,
          banner_photo: row.pro_banner_photo,
          city: row.pro_city,
          instagram: row.pro_instagram,
          phone: row.pro_phone
        },
        prestation: row.prestation_id ? {
          id: row.prestation_id,
          name: row.prestation_name,
          description: row.prestation_description,
          duration_minutes: row.prestation_duration
        } : null,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
        price: Number(row.price),
        status: row.status,
        paid_online: Boolean(row.paid_online),
        created_at: row.created_at
      };

      res.json({
        success: true,
        data: booking
      });

    } catch (error) {
      console.error("❌ Error fetching booking details:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération de la réservation"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* CANCEL BOOKING */
app.patch(
  "/api/client/my-booking/:id/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const clientId = req.user?.id;
      const bookingId = parseParamToInt(req.params.id);

      if (!clientId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      if (isNaN(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "ID de réservation invalide"
        });
      }

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT id, status, start_datetime FROM reservations 
         WHERE id = ? AND client_id = ?`,
        [bookingId, clientId]
      ) as [any[], any];

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Réservation non trouvée"
        });
      }

      const booking = existing[0];

      if (booking.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: "Cette réservation est déjà annulée"
        });
      }

      if (booking.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: "Impossible d'annuler une réservation terminée"
        });
      }

      const now = new Date();
      const startDate = new Date(booking.start_datetime);
      const hoursUntilBooking = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilBooking < 24) {
        return res.status(400).json({
          success: false,
          message: "Impossible d'annuler moins de 24h avant le rendez-vous"
        });
      }

      await connection.query(
        `UPDATE reservations SET status = 'cancelled' WHERE id = ?`,
        [bookingId]
      );

      console.log(`✅ Réservation ${bookingId} annulée par le client ${clientId}`);

      res.json({
        success: true,
        message: "Réservation annulée avec succès"
      });

    } catch (error) {
      console.error("❌ Error cancelling booking:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'annulation"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// =====================
// ADMIN - DASHBOARD
// =====================

// Route pour les compteurs du dashboard admin
app.get("/api/admin/dashboard/counts", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;

    // Vérifier que c'est un admin
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    // Total utilisateurs
    const [totalUsersRows] = await db.query("SELECT COUNT(*) as count FROM users");
    const totalUsers = (totalUsersRows as any[])[0]?.count || 0;

    // Total réservations
    const [totalBookingsRows] = await db.query("SELECT COUNT(*) as count FROM reservations");
    const totalBookings = (totalBookingsRows as any[])[0]?.count || 0;

    // Notifications non lues (par défaut 0 si table inexistante)
    let unreadNotifications = 0;
    try {
      const [unreadNotifRows] = await db.query(
        "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0",
        [adminId]
      );
      unreadNotifications = (unreadNotifRows as any[])[0]?.count || 0;
    } catch (error) {
      console.log("Notifications table not found, defaulting to 0");
    }

    res.json({
      success: true,
      counts: {
        totalUsers,
        totalBookings,
        unreadNotifications,
      },
    });
  } catch (error) {
    console.error("Error fetching counts:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// Stats complètes du dashboard
app.get("/api/admin/dashboard/stats", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;

    // Vérifier que c'est un admin
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    // Total utilisateurs
    const [totalUsersRows] = await db.query("SELECT COUNT(*) as count FROM users");
    const totalUsers = (totalUsersRows as any[])[0]?.count || 0;

    // Total pros
    const [totalProsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'pro'");
    const totalPros = (totalProsRows as any[])[0]?.count || 0;

    // Total clients
    const [totalClientsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'client'");
    const totalClients = (totalClientsRows as any[])[0]?.count || 0;

    // Total réservations
    const [totalBookingsRows] = await db.query("SELECT COUNT(*) as count FROM reservations");
    const totalBookings = (totalBookingsRows as any[])[0]?.count || 0;

    // Réservations du jour
    const [todayBookingsRows] = await db.query(
      "SELECT COUNT(*) as count FROM reservations WHERE DATE(start_datetime) = CURDATE()"
    );
    const todayBookings = (todayBookingsRows as any[])[0]?.count || 0;

    // Chiffre d'affaires total
    const [totalRevenueRows] = await db.query(
      "SELECT IFNULL(SUM(price), 0) as total FROM reservations WHERE status IN ('confirmed', 'completed')"
    );
    const totalRevenue = Number((totalRevenueRows as any[])[0]?.total || 0);

    // Chiffre d'affaires du mois
    const [monthRevenueRows] = await db.query(
      "SELECT IFNULL(SUM(price), 0) as total FROM reservations WHERE status IN ('confirmed', 'completed') AND YEAR(start_datetime) = YEAR(CURDATE()) AND MONTH(start_datetime) = MONTH(CURDATE())"
    );
    const monthRevenue = Number((monthRevenueRows as any[])[0]?.total || 0);

    // Utilisateurs actifs (derniers 7 jours)
    const [activeUsersRows] = await db.query(
      "SELECT COUNT(DISTINCT user_id) as count FROM refresh_tokens WHERE expires_at > NOW() AND revoked = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    const activeUsers = (activeUsersRows as any[])[0]?.count || 0;

    // Activité récente (dernières 24h)
    const [recentActivity] = await db.query(`
      (SELECT 
        'booking' as type,
        CONCAT('Nouvelle réservation de ', c.first_name, ' ', c.last_name) as title,
        CONCAT('Chez ', p.first_name, ' ', p.last_name) as description,
        DATE_FORMAT(r.created_at, '%H:%i') as time,
        r.created_at as timestamp
      FROM reservations r
      JOIN users c ON c.id = r.client_id
      JOIN users p ON p.id = r.pro_id
      WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY r.created_at DESC
      LIMIT 5)
      
      UNION ALL
      
      (SELECT 
        'user' as type,
        CONCAT('Nouvel utilisateur : ', u.first_name, ' ', u.last_name) as title,
        CONCAT('Rôle : ', IF(u.role = 'pro', 'Professionnel', 'Client')) as description,
        DATE_FORMAT(u.created_at, '%H:%i') as time,
        u.created_at as timestamp
      FROM users u
      WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY u.created_at DESC
      LIMIT 5)
      
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPros,
        totalClients,
        totalBookings,
        todayBookings,
        totalRevenue,
        monthRevenue,
        activeUsers,
      },
      recentActivity: (recentActivity as any[]).map((activity: any) => ({
        type: activity.type,
        title: activity.title,
        description: activity.description,
        time: activity.time,
      })),
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// =====================
// ADMIN - USERS CRUD
// =====================

// GET tous les utilisateurs
app.get("/api/admin/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const [users] = await db.query("SELECT * FROM users ORDER BY created_at DESC");
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// CREATE utilisateur
app.post("/api/admin/users/create", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const {
      first_name,
      last_name,
      phone_number,
      email,
      birth_date,
      role,
      is_admin,
      activity_name,
      city,
      instagram_account,
      profile_photo,
      banner_photo,
      bankaccountname,
      IBAN,
      iban_last4,
      accept_online_payment,
      pro_status,
      bio,
      profile_visibility
    } = req.body;

    // Validation des champs obligatoires
    if (!first_name || !last_name || !phone_number || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Les champs first_name, last_name, phone_number, email et role sont obligatoires"
      });
    }

    // Vérifier si l'email existe déjà
    const [emailCheck] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if ((emailCheck as any).length > 0) {
      return res.status(400).json({ success: false, message: "Cet email est déjà utilisé" });
    }

    // ✅ CORRECTION: Convertir birth_date
    let formattedBirthDate = null;
    if (birth_date) {
      try {
        const dateObj = new Date(birth_date);
        if (!isNaN(dateObj.getTime())) {
          formattedBirthDate = dateObj.toISOString().split('T')[0];
        }
      } catch (error) {
        console.error("Error parsing birth_date:", error);
      }
    }

    // Hash du mot de passe temporaire
    const tempPassword = 'TempPassword123!';
    const password_hash = await bcrypt.hash(tempPassword, 12);

    // Générer iban_hash si IBAN fourni
    let iban_hash = null;
    let computed_iban_last4 = iban_last4 || null;
    if (IBAN) {
      iban_hash = crypto.createHash('sha256').update(IBAN).digest('hex');
      if (!computed_iban_last4) {
        computed_iban_last4 = IBAN.slice(-4);
      }
    }

    await db.query(
      `INSERT INTO users (
        first_name, 
        last_name, 
        phone_number,
        email, 
        birth_date,
        password_hash,
        is_verified,
        role, 
        is_admin,
        created_at,
        activity_name,
        city,
        instagram_account,
        profile_photo,
        banner_photo,
        bankaccountname,
        IBAN,
        iban_last4,
        iban_hash,
        accept_online_payment,
        pro_status,
        bio,
        profile_visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        first_name,
        last_name,
        phone_number,
        email,
        formattedBirthDate, // ✅ Date formatée
        password_hash,
        0, // is_verified par défaut
        role,
        is_admin ? 1 : 0,
        activity_name || null,
        city || null,
        instagram_account || null,
        profile_photo || null,
        banner_photo || null,
        bankaccountname || null,
        IBAN || null,
        computed_iban_last4,
        iban_hash,
        accept_online_payment ? 1 : 0,
        pro_status || 'inactive',
        bio || null,
        profile_visibility || 'public'
      ]
    );

    res.json({ success: true, message: "Utilisateur créé avec succès" });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});


// UPDATE utilisateur
app.put("/api/admin/users/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const userId = req.params.id;
    const {
      first_name,
      last_name,
      phone_number,
      email,
      birth_date,
      role,
      is_admin,
      activity_name,
      city,
      instagram_account,
      profile_photo,
      banner_photo,
      bankaccountname,
      IBAN,
      iban_last4,
      accept_online_payment,
      pro_status,
      bio,
      profile_visibility,
      is_verified
    } = req.body;

    // Validation des champs obligatoires
    if (!first_name || !last_name || !phone_number || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Les champs first_name, last_name, phone_number, email et role sont obligatoires"
      });
    }

    // Vérifier email unique
    const [emailCheck] = await db.query(
      "SELECT id FROM users WHERE email = ? AND id != ?",
      [email, userId]
    );
    if ((emailCheck as any).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cet email est déjà utilisé"
      });
    }

    let formattedBirthDate = null;
    if (birth_date) {
      try {
        const dateObj = new Date(birth_date);
        if (!isNaN(dateObj.getTime())) {
          formattedBirthDate = dateObj.toISOString().split('T')[0];
        }
      } catch (error) {
        console.error("Error parsing birth_date:", error);
        formattedBirthDate = null;
      }
    }

    // Générer iban_hash si IBAN fourni
    let iban_hash = null;
    let computed_iban_last4 = iban_last4 || null;
    if (IBAN) {
      iban_hash = crypto.createHash('sha256').update(IBAN).digest('hex');
      if (!computed_iban_last4) {
        computed_iban_last4 = IBAN.slice(-4);
      }
    }

    // UPDATE
    await db.query(
      `UPDATE users SET 
        first_name = ?, 
        last_name = ?, 
        phone_number = ?,
        email = ?, 
        birth_date = ?,
        role = ?, 
        is_admin = ?,
        activity_name = ?,
        city = ?,
        instagram_account = ?,
        profile_photo = ?,
        banner_photo = ?,
        bankaccountname = ?,
        IBAN = ?,
        iban_last4 = ?,
        iban_hash = ?,
        accept_online_payment = ?,
        pro_status = ?,
        bio = ?,
        profile_visibility = ?,
        is_verified = ?
      WHERE id = ?`,
      [
        first_name,
        last_name,
        phone_number,
        email,
        formattedBirthDate,
        role,
        is_admin ? 1 : 0,
        activity_name || null,
        city || null,
        instagram_account || null,
        profile_photo || null,
        banner_photo || null,
        bankaccountname || null,
        IBAN || null,
        computed_iban_last4,
        iban_hash,
        accept_online_payment ? 1 : 0,
        pro_status || 'inactive',
        bio || null,
        profile_visibility || 'public',
        is_verified ? 1 : 0,
        userId
      ]
    );

    res.json({ success: true, message: "Utilisateur modifié avec succès" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// DELETE utilisateur
app.delete("/api/admin/users/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const userId = req.params.id;

    const [userRows] = await db.query("SELECT is_admin FROM users WHERE id = ?", [userId]);

    if ((userRows as any[])[0]?.is_admin) {
      const [adminsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE is_admin = 1");
      if ((adminsRows as any[])[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: "Impossible de supprimer le dernier administrateur"
        });
      }
    }

    // Supprimer l'utilisateur
    const [result] = await db.query("DELETE FROM users WHERE id = ?", [userId]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }

    res.json({ success: true, message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});


// =====================
// ADMIN - BOOKINGS CRUD
// =====================

// GET toutes les réservations
app.get("/api/admin/bookings", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const [bookings] = await db.query(`
      SELECT 
        r.*,
        CONCAT(c.first_name, ' ', c.last_name) as client_name,
        CONCAT(p.first_name, ' ', p.last_name) as pro_name
      FROM reservations r
      LEFT JOIN users c ON r.client_id = c.id
      LEFT JOIN users p ON r.pro_id = p.id
      ORDER BY r.start_datetime DESC
    `);

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// CREATE réservation
app.post("/api/admin/bookings/create", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

    // Validation
    if (!client_id || !pro_id || !prestation_id || !start_datetime || !end_datetime || !price) {
      return res.status(400).json({
        success: false,
        message: "Tous les champs requis doivent être remplis"
      });
    }

    await db.query(
      `INSERT INTO reservations (
        client_id, 
        pro_id, 
        prestation_id, 
        start_datetime, 
        end_datetime, 
        status, 
        price, 
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [client_id, pro_id, prestation_id, start_datetime, end_datetime, status || 'pending', price]
    );

    res.json({ success: true, message: "Réservation créée avec succès" });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// UPDATE réservation
app.put("/api/admin/bookings/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const bookingId = req.params.id;
    const { client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price } = req.body;

    // Validation
    if (!client_id || !pro_id || !prestation_id || !start_datetime || !end_datetime || !price) {
      return res.status(400).json({
        success: false,
        message: "Tous les champs requis doivent être remplis"
      });
    }

    await db.query(
      `UPDATE reservations SET 
        client_id = ?, 
        pro_id = ?, 
        prestation_id = ?, 
        start_datetime = ?, 
        end_datetime = ?, 
        status = ?, 
        price = ? 
      WHERE id = ?`,
      [client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price, bookingId]
    );

    res.json({ success: true, message: "Réservation modifiée avec succès" });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// DELETE réservation
app.delete("/api/admin/bookings/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const [adminCheck] = await db.query("SELECT is_admin FROM users WHERE id = ?", [adminId]);
    if ((adminCheck as any).length === 0 || !(adminCheck as any)[0].is_admin) {
      return res.status(403).json({ success: false, message: "Accès réservé aux admins" });
    }

    const bookingId = req.params.id;
    const [result] = await db.query("DELETE FROM reservations WHERE id = ?", [bookingId]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Réservation non trouvée" });
    }

    res.json({ success: true, message: "Réservation supprimée avec succès" });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
});