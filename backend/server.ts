// ==========================================
// 0. SENTRY — must be imported before everything else
// ==========================================
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    beforeSend(event) {
      // Strip request body (may contain PII)
      if (event.request) {
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
          delete event.request.headers["Authorization"];
          delete event.request.headers["Cookie"];
        }
      }
      return event;
    },
  });
}

// ==========================================
// 1. IMPORTS
// ==========================================
import express, { Request, Response, NextFunction, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import { getDb, DbTimeoutError } from "./lib/db";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { isValidIBAN, electronicFormatIBAN } from "ibantools";
import crypto from "crypto";
import ExcelJS from "exceljs";
import Stripe from "stripe";

// ── Observability ─────────────────────────────────────────────────────────
import { log } from "./lib/logger";
import { sendAlert, track5xx } from "./lib/alerts";

// ── Modules extraits (PR #3) ───────────────────────────────────────────────
import {
  connectedClients,
  sendUnreadNotifications,
  sendNotificationToUser,
  broadcastNotification,
} from "./lib/notifications";
import { authMiddleware, authenticateToken } from "./middleware/auth";
import {
  bookingLimiter,
  paymentIntentLimiter,
  ibanUpdateLimiter,
  publicListingLimiter,
  adminLimiter,
  instagramLimiter,
} from "./middleware/rate-limits";
import { validate, userUpdateSchema, financeObjectiveSchema, prestationSchema, prestationPatchSchema, slotCreateSchema, reservationSchema, reviewSchema, depositSchema, paymentIntentSchema, favoriteSchema } from "./middleware/validate";
import authRouter from "./routes/auth.routes";
import adminRouter from "./routes/admin.routes";
import {
  encryptSensitiveData,
  decryptSensitiveData,
  encryptIban,
  decryptIban,
} from "./lib/encryption";

// ==========================================
// 2. CONFIGURATION ENV
// ==========================================
const envFile = process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
const envPath = path.resolve(__dirname, "..", envFile);
console.log("Loading env from:", envPath);

dotenv.config({ path: envPath });

// ── Startup env var validation ─────────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REVENUECAT_WEBHOOK_SECRET",
] as const;

const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(
    `❌ Variables d'environnement manquantes : ${missingVars.join(", ")}`
  );
  process.exit(1);
}

// ==========================================
// 2b. STRIPE INIT
// ==========================================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


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
const router = Router();
const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:8080", "https://app.blyssapp.fr"];

// ==========================================
// 5. CONNEXION DATABASE (Supabase via pg)
// ==========================================
const db = getDb();

// ==========================================
// 6. WEBSOCKET - CLIENTS MAP → lib/notifications.ts
// ==========================================
// connectedClients, checkNotificationPreference, sendUnreadNotifications,
// sendNotificationToUser, broadcastNotification importés depuis lib/notifications.ts

// ==========================================
// 8. MIDDLEWARE
// ==========================================

// Security headers (before anything else, after Stripe raw-body route)
app.use(
  helmet({
    contentSecurityPolicy: false, // Géré côté frontend/CDN
    crossOriginEmbedderPolicy: false, // WebSocket + assets cross-origin
  })
);

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

// Rate limiters → middleware/rate-limits.ts (utilisés par auth.routes.ts)

// ==========================================
// STRIPE WEBHOOK (raw body - BEFORE express.json())
// ==========================================
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      log.warn("/api/webhooks/stripe", "Signature verification failed", { ip: req.ip });
      sendAlert("warn", "Stripe invalid signature", { ip: req.ip }).catch(() => {});
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log(`[STRIPE_WEBHOOK] Event: ${event.type}, id: ${event.id}`);

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await db.execute(
            `UPDATE payments SET status = 'succeeded', updated_at = NOW() WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          // Get payment info to update reservation
          const [paymentRows] = await db.query(
            `SELECT reservation_id, amount, type FROM payments WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          const payment = (paymentRows as any[])[0];
          if (payment) {
            const newStatus = payment.type === "deposit" ? "deposit_paid" : "fully_paid";
            await db.execute(
              `UPDATE reservations SET payment_status = ?, total_paid = total_paid + ? WHERE id = ?`,
              [newStatus, payment.amount, payment.reservation_id]
            );
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await db.execute(
            `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const piId = charge.payment_intent as string;
          if (piId) {
            await db.execute(
              `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE stripe_payment_intent_id = ?`,
              [piId]
            );
          }
          break;
        }
        default:
          console.log(`[STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[STRIPE_WEBHOOK] Processing error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(express.json());
app.use(cookieParser());

// authMiddleware / authenticateToken → middleware/auth.ts (importé en haut)

// ── Routeurs extraits ──────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/admin", adminLimiter, adminRouter);
app.use("/api/pro", router);

// ── Health check (no auth) ──────────────────────────────────────────────────
app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await getDb().query("SELECT 1");
    res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", db: "error", timestamp: new Date().toISOString() });
  }
});

// ==========================================
// 9. WEBSOCKET SERVER
// ==========================================
const wss = new WebSocketServer({ server });

interface WebSocketMessage {
  type: string;
  data?: any;
}

// ✅ Configuration des timeouts
const AUTH_TIMEOUT = 10000; // 10 secondes pour s'authentifier
const HEARTBEAT_INTERVAL = 30000; // 30 secondes
const HEARTBEAT_TIMEOUT = 35000; // 35 secondes

// ✅ Interface pour le WebSocket avec métadonnées
interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAuthenticated?: boolean;
  isAlive?: boolean;
  authTimeout?: NodeJS.Timeout;
}

// Helper: parse a raw Cookie header string into a key/value map
function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((pair) => pair.trim().split("="))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.trim(), decodeURIComponent(v.trim())])
  );
}

// Helper: authenticate a WS client and flush unread notifications
async function wsAuthenticate(ws: AuthenticatedWebSocket, token: string): Promise<boolean> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    ws.userId = decoded.id;
    ws.isAuthenticated = true;
    if (ws.authTimeout) {
      clearTimeout(ws.authTimeout);
      ws.authTimeout = undefined;
    }
    connectedClients.set(ws.userId, ws);
    log.info("/ws/auth", 200, 0, ws.userId);
    ws.send(JSON.stringify({ type: "auth_success", data: { userId: ws.userId } }));
    await sendUnreadNotifications(ws, ws.userId);
    return true;
  } catch {
    return false;
  }
}

wss.on("connection", async (ws: AuthenticatedWebSocket, req) => {
  console.log("🔌 New WebSocket connection");

  ws.userId = undefined;
  ws.isAuthenticated = false;
  ws.isAlive = true;

  // Try cookie-based auth from the HTTP upgrade request headers
  const cookieHeader = req.headers.cookie ?? "";
  const cookies = parseCookies(cookieHeader);
  if (cookies.access_token) {
    await wsAuthenticate(ws, cookies.access_token);
  }

  // ✅ Timeout d'authentification : ferme la connexion si pas d'auth dans 10s
  ws.authTimeout = setTimeout(() => {
    if (!ws.isAuthenticated) {
      console.log("⏱️ Auth timeout, closing connection");
      ws.send(
        JSON.stringify({
          type: "auth_error",
          data: { message: "Authentication timeout" },
        })
      );
      ws.close(4001, "Authentication timeout");
    }
  }, AUTH_TIMEOUT);

  // ✅ Gestion du pong pour heartbeat
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message.toString()) as WebSocketMessage;

      // ✅ Authentification (message-based fallback for non-cookie clients)
      if (data.type === "auth" && data.data?.token) {
        const ok = await wsAuthenticate(ws, data.data.token);
        if (!ok) {
          ws.send(
            JSON.stringify({
              type: "auth_error",
              data: { message: "Invalid or expired token", code: "INVALID_TOKEN" },
            })
          );
          ws.close(4001, "Authentication failed");
        }
        return;
      }

      // ✅ Vérifier l'authentification pour toutes les autres actions
      if (!ws.isAuthenticated || !ws.userId) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: { message: "Not authenticated" },
          })
        );
        return;
      }

      // ✅ Marquer une notification comme lue
      if (data.type === "mark_read") {
        const notificationId = data.data?.notificationId;

        if (!notificationId) {
          ws.send(
            JSON.stringify({
              type: "error",
              data: { message: "Missing notificationId" },
            })
          );
          return;
        }

        await db.query(
          `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
          [notificationId, ws.userId]
        );

        ws.send(
          JSON.stringify({
            type: "mark_read_success",
            data: { notificationId },
          })
        );
      }

      // ✅ Marquer toutes les notifications comme lues
      if (data.type === "mark_all_read") {
        await db.query(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
          [ws.userId]
        );

        ws.send(
          JSON.stringify({
            type: "mark_all_read_success",
          })
        );
      }

    } catch (error) {
      console.error("❌ WebSocket message error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          data: { message: "Invalid message format" },
        })
      );
    }
  });

  // ✅ Gestion de la déconnexion (une seule fois)
  ws.on("close", () => {
    if (ws.authTimeout) {
      clearTimeout(ws.authTimeout);
    }

    if (ws.userId) {
      connectedClients.delete(ws.userId);
      log.info("/ws/disconnect", 0, 0, ws.userId);
    } else {
      console.log("🔌 Unauthenticated client disconnected");
    }
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

// ✅ Heartbeat interval global pour tous les clients
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws: AuthenticatedWebSocket) => {
    // ✅ Terminer les connexions mortes
    if (ws.isAlive === false) {
      log.warn("/ws/heartbeat", "Terminating dead WS connection", { uid: ws.userId ?? "unknown" });

      if (ws.userId) {
        connectedClients.delete(ws.userId);
      }

      return ws.terminate();
    }

    // ✅ Marquer comme potentiellement morte jusqu'au prochain pong
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// ✅ Nettoyer l'interval quand le serveur se ferme
wss.on("close", () => {
  clearInterval(heartbeatInterval);
  console.log("🔌 WebSocket server closed");
});

console.log("✅ WebSocket server ready with heartbeat");

// ==========================================
// REVENUECAT WEBHOOK (no auth middleware - uses its own secret)
// ==========================================

app.post("/api/webhooks/revenuecat", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const event = req.body?.event;
    if (!event) {
      return res.status(400).json({ success: false, message: "No event in body" });
    }

    const eventType: string = event.type;
    const appUserId: string = event.app_user_id;
    const productId: string = event.product_id ?? "";
    const expirationAtMs: number | null = event.expiration_at_ms ?? null;

    if (!appUserId) {
      return res.status(400).json({ success: false, message: "Missing app_user_id" });
    }

    const userId = parseInt(appUserId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid app_user_id" });
    }

    // Determine plan from product_id
    let plan: string = "start";
    if (productId.includes("signature")) plan = "signature";
    else if (productId.includes("serenite")) plan = "serenite";

    // Determine billing type
    const billingType = productId.includes("annual") ? "one_time" : "monthly";

    log.info("/api/webhooks/revenuecat", 200, 0, userId);

    const activateEvents = ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"];
    const deactivateEvents = ["CANCELLATION", "EXPIRATION"];

    if (activateEvents.includes(eventType)) {
      const startDate = new Date().toISOString().slice(0, 10);
      const endDate = expirationAtMs
        ? new Date(expirationAtMs).toISOString().slice(0, 10)
        : null;

      // Cancel existing active subscriptions for this user
      await db.execute(
        `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
        [userId]
      );

      // Insert new subscription
      await db.execute(
        `INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
         VALUES (?, ?, ?, 0, NULL, NULL, ?, ?, 'active', ?)`,
        [userId, plan, billingType, startDate, endDate, `rc_${event.id ?? eventType}`]
      );

      // Activate pro status
      await db.execute(
        `UPDATE users SET pro_status = 'active' WHERE id = ?`,
        [userId]
      );

      log.info("/api/webhooks/revenuecat/activate", 200, 0, userId);
    } else if (deactivateEvents.includes(eventType)) {
      await db.execute(
        `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
        [userId]
      );

      await db.execute(
        `UPDATE users SET pro_status = 'inactive' WHERE id = ?`,
        [userId]
      );

      log.info("/api/webhooks/revenuecat/deactivate", 200, 0, userId);
    } else {
      console.log(`[RC_WEBHOOK] Unhandled event type: ${eventType}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[RC_WEBHOOK] Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ==========================================
// API ROUTES - NOTIFICATIONS → routes/admin.routes.ts
// ==========================================

/* Toutes les routes /api/admin/* sont dans routes/admin.routes.ts */

// ==========================================
// CONFIGURATION CHIFFREMENT IBAN
// encryptIban/decryptIban/encryptSensitiveData/decryptSensitiveData
// importés depuis lib/encryption.ts (random IV par enregistrement)
// ==========================================
if (!process.env.IBAN_ENC_KEY) {
  console.error("❌ IBAN_ENC_KEY manquante");
  process.exit(1);
}
console.log("✅ Clés de chiffrement IBAN chargées");

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
      SET revoked = true
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
  "/api/users/pros/:proId",
  publicListingLimiter,
  async (req: Request, res: Response) => {
    try {
      const proId = parseParamToInt(req.params.proId);

      // Ajout d'un log pour vérifier le proId reçu
      console.log("🔎 proId reçu via params:", req.params.proId, "=>", proId);

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
      const proId = parseParamToInt(req.params.proId);
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
      const proId = parseParamToInt(req.params.proId);

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
  validate(slotCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = req.user?.id;
      const { start_datetime, end_datetime, duration } = req.body;

      // Insérer le slot
      const [result] = await db.query(
        `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [proId, start_datetime, end_datetime, duration ?? 60]
      );

      res.json({
        success: true,
        message: "Créneau créé",
        data: { id: (result as unknown as { insertId: number }).insertId }
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
      const slotId = parseParamToInt(req.params.slotId);
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
      const slotId = parseParamToInt(req.params.slotId);
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

// GET: Récupérer les dates avec au moins un slot disponible pour un pro dans un mois donné
app.get(
  "/api/slots/available-dates/:proId/:month",
  async (req: Request, res: Response) => {
    try {
      const proIdParam = req.params.proId;
      const monthParam = req.params.month;

      if (typeof proIdParam !== 'string' || typeof monthParam !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Paramètres invalides"
        });
      }

      const proId = parseInt(proIdParam, 10);

      console.log("🔍 Params reçus:", { proId, month: monthParam });

      if (isNaN(proId) || proId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID invalide"
        });
      }

      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return res.status(400).json({
          success: false,
          message: "Format mois invalide (attendu: YYYY-MM)"
        });
      }

      const [yearStr, monthStr] = monthParam.split('-');
      const year = parseInt(yearStr, 10);
      const monthNumber = parseInt(monthStr, 10);

      console.log("🔍 Recherche pour:", { year, monthNumber });

      const [result] = await db.query(
        `SELECT DISTINCT TO_CHAR(start_datetime, 'YYYY-MM-DD') as available_date
         FROM slots
         WHERE pro_id = ?
         AND status = 'available'
         AND EXTRACT(YEAR FROM start_datetime) = ?
         AND EXTRACT(MONTH FROM start_datetime) = ?
         ORDER BY available_date ASC`,
        [proId, year, monthNumber]
      );

      console.log("📊 Résultats:", (result as any[]).length, "jours");

      const dates = (result as any[]).map((row: any) => row.available_date);

      res.json({ success: true, data: dates });
    } catch (error) {
      console.error("❌ Erreur:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    }
  }
);



// AUTH ROUTES → routes/auth.routes.ts (monté sur /api/auth)

// ===== GET /api/pro/prestations =====
router.get('/prestations', authMiddleware, async (req: any, res: any) => {
  try {
    const [rows] = await db.query(
      `SELECT id, pro_id, name, description, price, duration_minutes, active, created_at
       FROM prestations
       WHERE pro_id = ?
       ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('GET /prestations error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== POST /api/pro/prestations =====
router.post('/prestations', authMiddleware, validate(prestationSchema), async (req: any, res: any) => {
  try {
    const { name, description, price, duration_minutes, active } = req.body;
    const [result] = await db.query(
      `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user!.id, name, description, price, duration_minutes, active]
    );
    // Get the inserted row
    const [rows] = await db.query(
      `SELECT * FROM prestations WHERE id = ?`,
      [(result as any).insertId]
    );
    res.status(201).json({ success: true, data: (rows as any[])[0] });
  } catch (error) {
    console.error('POST /prestations error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== PATCH /api/pro/prestations/:id =====
router.patch('/prestations/:id', authMiddleware, validate(prestationPatchSchema), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description, price, duration_minutes, active } = req.body;
    // Vérifie que la prestation appartient au pro
    const [check] = await db.query(
      'SELECT id FROM prestations WHERE id = ? AND pro_id = ?',
      [id, req.user!.id]
    );
    if ((check as any[]).length === 0) {
      return res.status(404).json({ success: false, error: 'Prestation introuvable' });
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) {
      updates.push(`name = ?`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = ?`);
      values.push(description);
    }
    if (price !== undefined) {
      updates.push(`price = ?`);
      values.push(price);
    }
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = ?`);
      values.push(duration_minutes);
    }
    if (active !== undefined) {
      updates.push(`active = ?`);
      values.push(active);
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucune modification fournie' });
    }
    values.push(id);
    await db.query(
      `UPDATE prestations
       SET ${updates.join(', ')}
       WHERE id = ?`,
      values
    );
    // Get the updated row
    const [rows] = await db.query(
      `SELECT * FROM prestations WHERE id = ?`,
      [id]
    );
    res.json({ success: true, data: (rows as any[])[0] });
  } catch (error) {
    console.error('PATCH /prestations/:id error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== DELETE /api/pro/prestations/:id =====
router.delete('/prestations/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    // Delete and check if existed
    const [result] = await db.query(
      'DELETE FROM prestations WHERE id = ? AND pro_id = ?',
      [id, req.user!.id]
    );
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Prestation introuvable' });
    }
    res.json({ success: true, data: { id: parseInt(id) } });
  } catch (error) {
    console.error('DELETE /prestations/:id error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== POST /api/pro/prestations/:id/duplicate =====
router.post('/prestations/:id/duplicate', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    // Récupère la prestation originale
    const [originalRows] = await db.query(
      'SELECT * FROM prestations WHERE id = ? AND pro_id = ?',
      [id, req.user!.id]
    );
    if ((originalRows as any[]).length === 0) {
      return res.status(404).json({ success: false, error: 'Prestation introuvable' });
    }
    const presta = (originalRows as any[])[0];
    // Duplique
    const [result] = await db.query(
      `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user!.id,
        `${presta.name} (copie)`,
        presta.description,
        presta.price,
        presta.duration_minutes,
        false // désactivée par défaut
      ]
    );
    // Get the duplicated prestation
    const [rows] = await db.query(
      `SELECT * FROM prestations WHERE id = ?`,
      [(result as any).insertId]
    );
    res.status(201).json({ success: true, data: (rows as any[])[0] });
  } catch (error) {
    console.error('POST /prestations/:id/duplicate error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/auth/profile → routes/auth.routes.ts

// =====================
// FINANCE PRO ROUTES (Signature only)
// =====================

// GET /api/pro/finance/stats - Dashboard Finance
app.get("/api/pro/finance/stats", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;
  try {
    const userId = req.user.id;

    log.info("/api/pro/finance/stats", 200, 0, userId);

    // === 1. Vérifier pro actif ===
    const [userRows]: any = await db.query(
      "SELECT role, pro_status, monthly_objective FROM users WHERE id = ?",
      [userId]
    );

    const user = userRows?.[0];
    console.log(`[FINANCE_STATS][${rid}] userRow=`, user);

    if (!user || user.role !== "pro" || user.pro_status !== "active") {
      console.log(`[FINANCE_STATS][${rid}] BLOCK: pro not active`);
      return res.status(403).json({
        success: false,
        error: "Accès réservé aux professionnels actifs",
      });
    }

    // === 2. Vérifier abonnement Signature ===
    const [subscriptionRows]: any = await db.query(
      "SELECT plan, status, id FROM subscriptions WHERE client_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      [userId]
    );

    const subscription = subscriptionRows?.[0];
    console.log(`[FINANCE_STATS][${rid}] subscriptionRow=`, subscription);

    if (!subscription || subscription.status !== "active") {
      console.log(`[FINANCE_STATS][${rid}] BLOCK: no active subscription`);
      return res.status(403).json({
        success: false,
        error: "Aucun abonnement actif",
      });
    }

    if (subscription.plan !== "signature") {
      console.log(`[FINANCE_STATS][${rid}] BLOCK: wrong plan`, subscription.plan);
      return res.status(403).json({
        success: false,
        error: `Fonctionnalité réservée à l'abonnement Signature (actuel : ${subscription.plan})`,
      });
    }

    // === 3. Dates ===
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .split("T")[0];
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      .toISOString()
      .split("T")[0];

    // === 4. CA (sur reservations.start_datetime) ===
    const [[{ total: todayTotal }]]: any = await db.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM reservations
       WHERE pro_id = ?
       AND start_datetime::date = ?
       AND status IN ('confirmed','completed')`,
      [userId, today]
    );

    const [[{ total: monthTotal }]]: any = await db.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM reservations
       WHERE pro_id = ?
       AND start_datetime::date >= ?
       AND status IN ('confirmed','completed')`,
      [userId, startOfMonth]
    );

    const [[{ total: lastMonthTotal }]]: any = await db.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM reservations
       WHERE pro_id = ?
       AND start_datetime::date BETWEEN ? AND ?
       AND status IN ('confirmed','completed')`,
      [userId, startOfLastMonth, endOfLastMonth]
    );

    // === 5. Prévision (casts AVANT calcul) ===
    const todayTotalNum = Number(todayTotal) || 0;
    const monthTotalNum = Number(monthTotal) || 0;
    const lastMonthTotalNum = Number(lastMonthTotal) || 0;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const forecastNum =
      monthTotalNum + (monthTotalNum / Math.max(now.getDate(), 1)) * (daysInMonth - now.getDate());

    // === 6. Tendance (comparaison en nombres) ===
    let trend: "up" | "down" | "stable" = "stable";
    if (monthTotalNum > lastMonthTotalNum * 1.05) trend = "up";
    else if (monthTotalNum < lastMonthTotalNum * 0.95) trend = "down";

    return res.json({
      success: true,
      data: {
        today: todayTotalNum,
        month: monthTotalNum,
        lastMonth: lastMonthTotalNum,
        objective: Number(user?.monthly_objective ?? 0),
        forecast: Number.isFinite(forecastNum) ? Math.round(forecastNum) : 0,
        trend,
        topServices: [],
      },
    });
  } catch (error) {
    console.error(`[FINANCE_STATS][${rid}] error:`, error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du chargement des statistiques",
    });
  }
});

// PUT /api/pro/finance/objective - Update monthly objective
app.put("/api/pro/finance/objective", authenticateToken, validate(financeObjectiveSchema), async (req: any, res) => {
  const rid = req.requestId;

  try {
    const userId = req.user.id;
    const { objective } = req.body;

    log.info("/api/pro/finance/objective", 200, 0, userId);

    // 1) Vérifier pro actif
    const [userRows]: any = await db.query(
      "SELECT role, pro_status FROM users WHERE id = ?",
      [userId]
    );
    const user = userRows?.[0];

    console.log(`[FINANCE_OBJECTIVE][${rid}] userRow=`, user);

    if (!user || user.role !== "pro" || user.pro_status !== "active") {
      console.log(`[FINANCE_OBJECTIVE][${rid}] BLOCK: pro not active`);
      return res.status(403).json({
        success: false,
        error: "Accès réservé aux professionnels actifs",
      });
    }

    // 2) (Optionnel) Vérifier abonnement Signature — garde la même règle que /stats si tu veux
    const [subscriptionRows]: any = await db.query(
      "SELECT plan, status, id FROM subscriptions WHERE client_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      [userId]
    );
    const subscription = subscriptionRows?.[0];

    console.log(`[FINANCE_OBJECTIVE][${rid}] subscriptionRow=`, subscription);

    if (!subscription || subscription.status !== "active") {
      console.log(`[FINANCE_OBJECTIVE][${rid}] BLOCK: no active subscription`);
      return res.status(403).json({ success: false, error: "Aucun abonnement actif" });
    }

    if (subscription.plan !== "signature") {
      console.log(`[FINANCE_OBJECTIVE][${rid}] BLOCK: wrong plan`, subscription.plan);
      return res.status(403).json({
        success: false,
        error: `Fonctionnalité réservée à l'abonnement Signature (actuel : ${subscription.plan})`,
      });
    }

    // 3) Update
    await db.query("UPDATE users SET monthly_objective = ? WHERE id = ?", [
      Math.round(objective),
      userId,
    ]);

    console.log(`[FINANCE_OBJECTIVE][${rid}] OK updated objective=`, Math.round(objective));

    return res.json({
      success: true,
      data: { objective: Math.round(objective) },
    });
  } catch (error) {
    console.error(`[FINANCE_OBJECTIVE][${rid}] ERROR`, error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour de l'objectif",
    });
  }
});


// GET /api/pro/finance/export - Export Excel
app.get("/api/pro/finance/export", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;

  try {
    const userId = req.user.id;
    const period = req.query.period || "month"; // week | month | year

    // Vérifier l'abonnement Signature
    const [subRows]: any = await db.query(
      "SELECT plan, status, id FROM subscriptions WHERE client_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      [userId]
    );

    const subscription = subRows?.[0];
    console.log(`[FINANCE_EXPORT][${rid}] subscriptionRow=`, subscription);

    if (!subscription || subscription.plan !== "signature") {
      return res.status(403).json({
        success: false,
        error: "Fonctionnalité réservée à l'abonnement Signature",
      });
    }

    // Calculer les dates selon la période
    const now = new Date();
    let startDate: string;
    let periodLabel: string;

    switch (period) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];
        periodLabel = "Semaine dernière";
        break;
      case "year":
        startDate = `${now.getFullYear()}-01-01`;
        periodLabel = `Année ${now.getFullYear()}`;
        break;
      case "month":
      default:
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        periodLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    }

    // Récupérer les transactions (reservations)
    const [transactions]: any = await db.query(
      `SELECT 
        r.id,
        r.start_datetime,
        TIME(r.start_datetime) AS start_time,
        p.name AS prestation,
        CONCAT(c.first_name, ' ', c.last_name) AS client,
        r.price,
        r.status
      FROM reservations r
      JOIN prestations p ON r.prestation_id = p.id
      JOIN users c ON r.client_id = c.id
      WHERE r.pro_id = ?
      AND r.start_datetime::date >= ?
      AND r.status IN ('confirmed', 'completed')
      ORDER BY r.start_datetime DESC`,
      [userId, startDate]
    );

    // Créer le fichier Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Export Comptable");

    worksheet.mergeCells("A1:G1");
    worksheet.getCell("A1").value = `Export Comptable Blyss - ${periodLabel}`;
    worksheet.getCell("A1").font = { size: 16, bold: true };
    worksheet.getCell("A1").alignment = { horizontal: "center" };

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      "Date",
      "Heure",
      "Cliente",
      "Prestation",
      "Montant HT",
      "TVA (20%)",
      "Montant TTC",
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    transactions.forEach((t: any) => {
      const montantTTC = parseFloat(t.price);
      const montantHT = montantTTC / 1.2;
      const tva = montantTTC - montantHT;

      totalHT += montantHT;
      totalTVA += tva;
      totalTTC += montantTTC;

      const dateFR = new Date(t.start_datetime).toLocaleDateString("fr-FR");
      const time = t.start_time || new Date(t.start_datetime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      worksheet.addRow([
        dateFR,
        time,
        t.client,
        t.prestation,
        montantHT.toFixed(2),
        tva.toFixed(2),
        montantTTC.toFixed(2),
      ]);
    });

    worksheet.addRow([]);
    const totalRow = worksheet.addRow([
      "",
      "",
      "",
      "TOTAL",
      totalHT.toFixed(2),
      totalTVA.toFixed(2),
      totalTTC.toFixed(2),
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD700" } };

    worksheet.columns = [
      { width: 12 },
      { width: 10 },
      { width: 20 },
      { width: 25 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];

    worksheet.getColumn(5).numFmt = '#,##0.00 "€"';
    worksheet.getColumn(6).numFmt = '#,##0.00 "€"';
    worksheet.getColumn(7).numFmt = '#,##0.00 "€"';

    worksheet.addRow([]);
    worksheet.addRow([]);
    const noteRow = worksheet.addRow(["Note :", "Conforme aux exigences URSSAF - TVA à 20% appliquée"]);
    noteRow.font = { italic: true, size: 10 };

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=blyss-compta-${period}-${new Date().toISOString().slice(0, 7)}.xlsx`
    );

    return res.send(buffer);
  } catch (error) {
    console.error(`[FINANCE_EXPORT][${rid}] Export error:`, error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de l'export",
    });
  }
});


// login / refresh / logout → routes/auth.routes.ts

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
      if (user.IBAN && (user as any).iban_iv && (user as any).iban_tag) {
        try {
          const plainIban = decryptIban(user.IBAN as string, (user as any).iban_iv, (user as any).iban_tag);
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
          EXTRACT(YEAR FROM AGE(CURRENT_DATE, created_at))::int AS diff_years,
          (EXTRACT(YEAR FROM AGE(CURRENT_DATE, created_at)) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, created_at)))::int AS diff_months
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

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

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
  validate(userUpdateSchema),
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
  ibanUpdateLimiter,
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
        if (!formattedIban || !isValidIBAN(formattedIban)) {
          return res
            .status(400)
            .json({ success: false, message: "IBAN invalide." });
        }

        const { ciphertext: ibanCiphertext, iv: ibanIv, tag: ibanTag } = encryptIban(formattedIban);
        const encryptedAccountName = encryptSensitiveData(bankaccountname.trim());
        const ibanLast4 = formattedIban.slice(-4);
        const ibanHash = crypto.createHash("sha256").update(formattedIban).digest("hex");

        const [existing] = await db.execute(
          `SELECT id FROM users
           WHERE id != ?
           AND iban_hash = ?`,
          [userId, ibanHash]
        );

        if ((existing as any[]).length > 0) {
          return res.status(409).json({
            success: false,
            message: "Cet IBAN est déjà utilisé par un autre compte.",
          });
        }

        await db.execute(
          `UPDATE users
           SET
             bankaccountname = ?,
             "IBAN" = ?,
             iban_iv = ?,
             iban_tag = ?,
             iban_last4 = ?,
             iban_hash = ?,
             accept_online_payment = true,
             bank_info_updated_at = NOW()
           WHERE id = ?`,
          [encryptedAccountName, ibanCiphertext, ibanIv, ibanTag, ibanLast4, ibanHash, userId]
        );
      } else {
        await db.execute(
          `
          UPDATE users
          SET accept_online_payment = false
          WHERE id = ?
        `,
          [userId]
        );
      }

      const [rows] = await db.execute(
        `SELECT bankaccountname, "IBAN", iban_iv, iban_tag, iban_last4, accept_online_payment
         FROM users WHERE id = ?`,
        [userId]
      );
      const record = (rows as any[])[0];

      let maskedIban: string | null = null;
      let accountHolderName: string | null = null;

      if (record.IBAN && record.iban_iv && record.iban_tag) {
        try {
          const plainIban = decryptIban(record.IBAN as string, record.iban_iv, record.iban_tag);
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

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "deny",
    maxAge: "1h",
    etag: false,
  })
);

// ==========================================
// PUBLIC ROUTES - SPECIALISTS
// ==========================================

/* GET ALL ACTIVE PROS (PUBLIC) */
app.get(
  "/api/users/pros",
  publicListingLimiter,
  async (req: Request, res: Response) => {
    let connection;
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      connection = await db.getConnection();

      const [countRows] = await connection.query(
        `SELECT COUNT(*) as total FROM users WHERE role = 'pro' AND pro_status = 'active'`
      );
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

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
        LIMIT ? OFFSET ?
        `,
        [limit, offset]
      );

      res.json({
        success: true,
        data: rows,
        meta: { page, limit, total },
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
  publicListingLimiter,
  async (req: Request, res: Response) => {
    let connection;
    try {
      const proId = parseParamToInt(req.params.proId);

      if (isNaN(proId) || proId <= 0) {
        console.warn(`⚠️ ID invalide reçu: ${req.params.proId}`);
        return res.status(400).json({
          success: false,
          message: "ID du professionnel invalide"
        });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      connection = await db.getConnection();

      const [countRows] = await connection.query(
        `SELECT COUNT(*) as total FROM reviews WHERE pro_id = ?`,
        [proId]
      );
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

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
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [proId, limit, offset]
      );

      res.json({
        success: true,
        data: rows,
        meta: { page, limit, total },
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
          AND DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE)
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
          AND DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
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
        SELECT COALESCE(SUM(price), 0) AS total
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND start_datetime::date = CURRENT_DATE
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
          TO_CHAR(r.start_datetime, 'HH24:MI') AS start_time,
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
    AND status IN ('available', 'booked')
    AND start_datetime >= CURRENT_DATE
    AND start_datetime < CURRENT_DATE + INTERVAL '7 days'
  `,
        [proId]
      )) as [{ total_slots: number }[], any];
      const totalSlots = slotsRows[0]?.total_slots ?? 0;

      const [bookedRows] = (await connection.query(
        `
  SELECT COUNT(*) AS booked_slots
  FROM slots
  WHERE pro_id = ?
    AND status = 'booked'
    AND start_datetime >= CURRENT_DATE
    AND start_datetime < CURRENT_DATE + INTERVAL '7 days'
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
          AND DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE)
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
          AND r.start_datetime >= CURRENT_DATE - INTERVAL '30 days'
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
          EXTRACT(DOW FROM jour)::int + 1 AS dayOfWeek
        FROM (
          SELECT
            start_datetime::date AS jour,
            SUM(price) AS total
          FROM reservations
          WHERE pro_id = ?
            AND status IN ('confirmed', 'completed')
            AND DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE)
          GROUP BY start_datetime::date
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
        where += " AND r.start_datetime::date >= ?";
        params.push(from);
      }
      if (to) {
        where += " AND r.start_datetime::date <= ?";
        params.push(to);
      }

      const [rows] = (await connection.query(
        `
        SELECT
          r.id,
          r.start_datetime::date AS date,
          TO_CHAR(r.start_datetime, 'HH24:MI') AS time,
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
          ? + (? * INTERVAL '1 minute'),
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
          TO_CHAR(start_datetime, 'HH24:MI') AS time,
          duration,
          CASE
            WHEN start_datetime + (duration * INTERVAL '1 minute') < NOW() THEN 'past'
            ELSE status
          END AS computed_status,
          status AS original_status,
          CASE
            WHEN start_datetime + (duration * INTERVAL '1 minute') < NOW() THEN 0
            WHEN status = 'available' THEN 1
            ELSE 0
          END AS isActive,
          CASE
            WHEN start_datetime + (duration * INTERVAL '1 minute') < NOW() THEN 0
            WHEN status = 'available' THEN 1
            WHEN status = 'booked' THEN 0
            ELSE 1
          END AS isAvailable
        FROM slots
        WHERE pro_id = ?
          AND start_datetime::date = ?
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

/* CREATE REVIEW */
app.post("/api/reviews", authenticateToken, validate(reviewSchema), async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as AuthenticatedRequest).user?.id;
    const { pro_id, rating, comment } = req.body;

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
app.get('/api/client/my-booking', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;

    console.log(`🔍 Récupération réservations pour client ${clientId}`);

    const [rows] = await db.query(
      `SELECT 
        r.id,
        r.start_datetime,
        r.end_datetime,
        r.status,
        r.price,
        r.paid_online,
        p.name AS prestation_name,
        p.duration_minutes,
        u.first_name AS pro_first_name,
        u.last_name AS pro_last_name,
        u.activity_name,
        u.profile_photo,
        u.city
      FROM reservations r
      JOIN prestations p ON r.prestation_id = p.id
      JOIN users u ON r.pro_id = u.id
      WHERE r.client_id = ?
      ORDER BY r.start_datetime DESC`,
      [clientId]
    );

    console.log(`✅ ${(rows as any[]).length} réservations trouvées`);

    res.json({
      success: true,
      data: (rows as any[]).map((row: any) => ({
        id: row.id,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
        status: row.status,
        price: row.price,
        paid_online: row.paid_online,
        prestation: {
          name: row.prestation_name,
          duration_minutes: row.duration_minutes
        },
        pro: {
          first_name: row.pro_first_name,
          last_name: row.pro_last_name,
          name: row.activity_name,
          profile_photo: row.profile_photo,
          city: row.city
        }
      }))
    });

  } catch (error) {
    console.error('❌ Erreur my-booking:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

app.get(
  "/api/client/booking-detail/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clientId = req.user!.id;
      const bookingId = Number(req.params.id);

      const [rows] = await db.query(
        `SELECT 
            r.id,
            r.pro_id,
            r.client_id,
            r.prestation_id,
            r.start_datetime,
            r.end_datetime,
            r.status,
            r.price,
            r.paid_online,
            p.name AS prestation_name,
            p.description AS prestation_description,
            p.duration_minutes,
            u.first_name AS pro_first_name,
            u.last_name AS pro_last_name,
            u.profile_photo,
            u.activity_name,
            u.phone_number AS pro_phone,
            u.city
        FROM reservations r
        JOIN prestations p ON r.prestation_id = p.id
        JOIN users u ON r.pro_id = u.id
        WHERE r.id = ? AND r.client_id = ?`,
        [bookingId, clientId]
      );

      const booking = (rows as any[])[0];

      if (!booking) {
        return res.status(404).json({ success: false, message: "Réservation introuvable" });
      }

      booking.price = Number(booking.price) || 0;
      booking.paid_online = Number(booking.paid_online) || 0;
      booking.duration_minutes = Number(booking.duration_minutes) || 0;

      res.json({ success: true, data: booking });
    } catch (err) {
      console.error("Erreur GET booking-detail:", err);
      res.status(500).json({ success: false, message: "Erreur serveur" });
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
        `SELECT id, status, start_datetime, slot_id FROM reservations
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

      // Re-open the slot if one was linked to this booking
      if (booking.slot_id) {
        await connection.query(
          `UPDATE slots SET status = 'available' WHERE id = ?`,
          [booking.slot_id]
        );
      }

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
app.post("/api/favorites", authenticateToken, validate(favoriteSchema), async (req: Request, res: Response) => {
  let connection;
  try {
    const user = (req as AuthenticatedRequest).user;
    const clientId = user?.id;
    const { pro_id } = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
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
        id: (result as unknown as { insertId: number }).insertId,
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
    const proId = parseParamToInt(req.params.proId);

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

    if ((result as unknown as { affectedRows: number }).affectedRows === 0) {
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
  } catch (error) {
    console.error("❌ Erreur suppression favori:", error);
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
    const proId = parseParamToInt(req.params.proId);

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
  } catch (error) {
    console.error("❌ Erreur lors de la vérification favori:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification"
    });
  } finally {
    if (connection) connection.release();
  }
});


// ADMIN - DASHBOARD, USERS CRUD, BOOKINGS CRUD → routes/admin.routes.ts

// ==========================================
// STRIPE CONNECT - PRO ONBOARDING
// ==========================================

// POST /api/pro/stripe/onboard - Create Connect account + return onboarding URL
app.post("/api/pro/stripe/onboard", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const [userRows] = await db.query(
      `SELECT email, first_name, last_name, stripe_account_id FROM users WHERE id = ?`,
      [userId]
    );
    const user = (userRows as any[])[0];
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    let accountId = user.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          mcc: "7299",
          product_description: "Prestations de beauté et bien-être",
        },
      });
      accountId = account.id;
      await db.execute(
        `UPDATE users SET stripe_account_id = ? WHERE id = ?`,
        [accountId, userId]
      );
    }

    const returnUrl = `${req.headers.origin || "https://app.blyssapp.fr"}/pro/payments?stripe_return=true`;
    const refreshUrl = `${req.headers.origin || "https://app.blyssapp.fr"}/pro/payments?stripe_refresh=true`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return res.json({ success: true, url: accountLink.url });
  } catch (error) {
    console.error("[STRIPE_ONBOARD] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur Stripe onboarding" });
  }
});

// GET /api/pro/stripe/onboard/return - Check status after Stripe redirect
app.get("/api/pro/stripe/onboard/return", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const [userRows] = await db.query(
      `SELECT stripe_account_id FROM users WHERE id = ?`,
      [userId]
    );
    const user = (userRows as any[])[0];
    if (!user?.stripe_account_id) {
      return res.json({ success: true, onboarding_complete: false });
    }

    const account = await stripe.accounts.retrieve(user.stripe_account_id);
    const isComplete = account.charges_enabled && account.payouts_enabled;

    if (isComplete) {
      await db.execute(
        `UPDATE users SET stripe_onboarding_complete = true WHERE id = ?`,
        [userId]
      );
    }

    return res.json({
      success: true,
      onboarding_complete: isComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (error) {
    console.error("[STRIPE_ONBOARD_RETURN] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur vérification Stripe" });
  }
});

// GET /api/pro/stripe/account - Get Connect account status
app.get("/api/pro/stripe/account", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const [userRows] = await db.query(
      `SELECT stripe_account_id, stripe_onboarding_complete, deposit_percentage FROM users WHERE id = ?`,
      [userId]
    );
    const user = (userRows as any[])[0];
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    if (!user.stripe_account_id) {
      return res.json({
        success: true,
        data: {
          has_account: false,
          onboarding_complete: false,
          deposit_percentage: user.deposit_percentage,
        },
      });
    }

    const account = await stripe.accounts.retrieve(user.stripe_account_id);
    const isComplete = account.charges_enabled && account.payouts_enabled;

    // Sync onboarding status if changed
    if (isComplete && !user.stripe_onboarding_complete) {
      await db.execute(
        `UPDATE users SET stripe_onboarding_complete = true WHERE id = ?`,
        [userId]
      );
    }

    return res.json({
      success: true,
      data: {
        has_account: true,
        onboarding_complete: isComplete,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        deposit_percentage: user.deposit_percentage,
      },
    });
  } catch (error) {
    console.error("[STRIPE_ACCOUNT] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur récupération compte Stripe" });
  }
});

// PUT /api/pro/stripe/deposit - Update deposit percentage
app.put("/api/pro/stripe/deposit", authenticateToken, validate(depositSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { deposit_percentage } = req.body;

    await db.execute(
      `UPDATE users SET deposit_percentage = ? WHERE id = ?`,
      [deposit_percentage, userId]
    );

    return res.json({ success: true, data: { deposit_percentage } });
  } catch (error) {
    console.error("[STRIPE_DEPOSIT] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur mise à jour acompte" });
  }
});

// ==========================================
// RESERVATIONS API (client-facing)
// ==========================================

// POST /api/reservations - Create a reservation
app.post("/api/reservations", authenticateToken, bookingLimiter, validate(reservationSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;
    const { pro_id, prestation_id, start_datetime, end_datetime, price: parsedPrice, slot_id } = req.body;

    // Verify prestation belongs to the given pro
    const [prestationRows] = await db.query(
      `SELECT id FROM prestations WHERE id = ? AND pro_id = ?`,
      [prestation_id, pro_id]
    );
    if ((prestationRows as any[]).length === 0) {
      return res.status(403).json({ success: false, message: "Prestation invalide pour ce professionnel" });
    }

    // If a slot_id is provided, verify it is still available (owned by pro)
    if (slot_id) {
      const [slotRows] = await db.query(
        `SELECT status FROM slots WHERE id = ? AND pro_id = ?`,
        [slot_id, pro_id]
      );
      const slot = (slotRows as any[])[0];
      if (!slot || slot.status !== "available") {
        return res.status(409).json({ success: false, message: "Ce créneau n'est plus disponible" });
      }
    }

    // Prevent overlapping reservations with the same pro
    const [overlapRows] = await db.query(
      `SELECT id FROM reservations WHERE pro_id = ? AND status NOT IN ('cancelled', 'rejected') AND start_datetime < ? AND end_datetime > ?`,
      [pro_id, end_datetime, start_datetime]
    );
    if ((overlapRows as any[]).length > 0) {
      return res.status(409).json({ success: false, message: "Ce créneau est déjà réservé" });
    }

    // Get pro's deposit percentage
    const [proRows] = await db.query(
      `SELECT deposit_percentage, stripe_onboarding_complete FROM users WHERE id = ?`,
      [pro_id]
    );
    const pro = (proRows as any[])[0];
    if (!pro) {
      return res.status(404).json({ success: false, message: "Professionnel introuvable" });
    }
    const depositPct = pro.deposit_percentage ?? 50;
    const depositAmount = depositPct > 0 ? Math.round(parsedPrice * depositPct) / 100 : null;

    const [result] = await db.execute(
      `INSERT INTO reservations (client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price, payment_status, deposit_amount, slot_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?, 'unpaid', ?, ?, NOW())`,
      [clientId, pro_id, prestation_id, start_datetime, end_datetime, parsedPrice, depositAmount, slot_id || null]
    );

    const insertId = (result as unknown as { insertId: number }).insertId;

    // If slot_id, mark the slot as booked
    if (slot_id) {
      await db.execute(
        `UPDATE slots SET status = 'booked' WHERE id = ?`,
        [slot_id]
      );
    }

    return res.json({
      success: true,
      data: {
        id: insertId,
        deposit_percentage: depositPct,
        deposit_amount: depositAmount,
        price: parsedPrice,
      },
    });
  } catch (error) {
    console.error("[RESERVATION_CREATE] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur création réservation" });
  }
});

// GET /api/reservations/:id/payment-status - Get payment status
app.get("/api/reservations/:id/payment-status", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const reservationId = parseInt(req.params.id as string, 10);

    const [rows] = await db.query(
      `SELECT id, price, payment_status, total_paid, deposit_amount, client_id, pro_id
       FROM reservations WHERE id = ?`,
      [reservationId]
    );
    const reservation = (rows as any[])[0];
    if (!reservation) {
      return res.status(404).json({ success: false, message: "Réservation non trouvée" });
    }

    if (reservation.client_id !== userId && reservation.pro_id !== userId) {
      return res.status(403).json({ success: false, message: "Accès non autorisé" });
    }

    const remaining = reservation.price - reservation.total_paid;

    return res.json({
      success: true,
      data: {
        payment_status: reservation.payment_status,
        price: reservation.price,
        total_paid: reservation.total_paid,
        deposit_amount: reservation.deposit_amount,
        remaining,
      },
    });
  } catch (error) {
    console.error("[PAYMENT_STATUS] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// PUT /api/reservations/:id/pay-on-site - Mark balance as paid on site (pro only)
app.put("/api/reservations/:id/pay-on-site", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proId = req.user?.id;
    const reservationId = parseInt(req.params.id as string, 10);

    const [rows] = await db.query(
      `SELECT id, price, total_paid, pro_id FROM reservations WHERE id = ?`,
      [reservationId]
    );
    const reservation = (rows as any[])[0];
    if (!reservation) {
      return res.status(404).json({ success: false, message: "Réservation non trouvée" });
    }
    if (reservation.pro_id !== proId) {
      return res.status(403).json({ success: false, message: "Seul le professionnel peut marquer un paiement sur place" });
    }

    const remaining = reservation.price - reservation.total_paid;

    // Record on-site payment
    await db.execute(
      `INSERT INTO payments (reservation_id, client_id, pro_id, type, amount, status)
       SELECT ?, client_id, pro_id, 'on_site', ?, 'succeeded'
       FROM reservations WHERE id = ?`,
      [reservationId, remaining, reservationId]
    );

    await db.execute(
      `UPDATE reservations SET payment_status = 'paid_on_site', total_paid = price WHERE id = ?`,
      [reservationId]
    );

    return res.json({ success: true, message: "Paiement sur place enregistré" });
  } catch (error) {
    console.error("[PAY_ON_SITE] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ==========================================
// PAYMENTS API - Stripe PaymentIntents
// ==========================================

// POST /api/payments/create-intent - Create a PaymentIntent
app.post("/api/payments/create-intent", authenticateToken, paymentIntentLimiter, validate(paymentIntentSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;
    const { reservation_id, type } = req.body;

    // Get reservation details
    const [resaRows] = await db.query(
      `SELECT id, pro_id, client_id, price, total_paid, deposit_amount, payment_status
       FROM reservations WHERE id = ?`,
      [reservation_id]
    );
    const reservation = (resaRows as any[])[0];
    if (!reservation) {
      return res.status(404).json({ success: false, message: "Réservation non trouvée" });
    }
    if (reservation.client_id !== clientId) {
      return res.status(403).json({ success: false, message: "Accès non autorisé" });
    }

    // Get pro's Stripe Connect account
    const [proRows] = await db.query(
      `SELECT stripe_account_id, stripe_onboarding_complete FROM users WHERE id = ?`,
      [reservation.pro_id]
    );
    const pro = (proRows as any[])[0];
    if (!pro?.stripe_account_id || !pro.stripe_onboarding_complete) {
      return res.status(400).json({ success: false, message: "Le professionnel n'a pas configuré ses paiements Stripe" });
    }

    // Calculate amount based on type
    let amount: number;
    if (type === "deposit") {
      amount = reservation.deposit_amount || reservation.price;
    } else if (type === "balance") {
      amount = reservation.price - reservation.total_paid;
    } else {
      amount = reservation.price;
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Montant invalide" });
    }

    // Amount in cents for Stripe
    const amountCents = Math.round(amount * 100);

    // Ensure customer exists
    let stripeCustomerId: string;
    const [clientRows] = await db.query(
      `SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = ?`,
      [clientId]
    );
    const client = (clientRows as any[])[0];

    if (client.stripe_customer_id) {
      stripeCustomerId = client.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: client.email,
        name: `${client.first_name} ${client.last_name}`,
        metadata: { blyss_user_id: String(clientId) },
      });
      stripeCustomerId = customer.id;
      await db.execute(
        `UPDATE users SET stripe_customer_id = ? WHERE id = ?`,
        [stripeCustomerId, clientId]
      );
    }

    // Create PaymentIntent with direct charge on connected account
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      customer: stripeCustomerId,
      metadata: {
        reservation_id: String(reservation_id),
        client_id: String(clientId),
        pro_id: String(reservation.pro_id),
        type,
      },
      automatic_payment_methods: { enabled: true },
      transfer_data: {
        destination: pro.stripe_account_id,
      },
    });

    // Record payment in DB
    await db.execute(
      `INSERT INTO payments (reservation_id, client_id, pro_id, type, amount, stripe_payment_intent_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [reservation_id, clientId, reservation.pro_id, type, amount, paymentIntent.id]
    );

    return res.json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount,
      },
    });
  } catch (error) {
    console.error("[CREATE_INTENT] Error:", error);
    return res.status(500).json({ success: false, message: "Erreur création paiement" });
  }
});

// ==========================================
// INSTAGRAM INTEGRATION
// ==========================================

import { InstagramService } from "./services/InstagramService";

// ── Plan hierarchy pour le middleware requirePlan ──
const PLAN_HIERARCHY: Record<string, number> = {
  start: 1,
  serenite: 2,
  signature: 3,
};

/**
 * Middleware : vérifie en DB que l'utilisateur authentifié est un Pro
 * avec un abonnement actif au niveau requis.
 * Source of truth = base de données (jamais le JWT seul).
 */
function requirePlan(minPlan: "start" | "serenite" | "signature") {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const proId = req.user?.id;
    if (!proId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      // Vérification rôle + plan en une seule requête
      const [rows] = await db.query(
        `SELECT s.plan, s.status, u.role
         FROM subscriptions s
         JOIN users u ON u.id = s.client_id
         WHERE s.client_id = ?
           AND u.role = 'pro'
           AND s.status = 'active'
           AND (s.end_date IS NULL OR s.end_date > NOW())
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [proId]
      );

      const sub = (rows as any[])[0];

      if (!sub) {
        return res.status(403).json({
          success: false,
          error: "Active subscription required",
          code: "NO_ACTIVE_SUBSCRIPTION",
        });
      }

      if (sub.role !== "pro") {
        return res.status(403).json({
          success: false,
          error: "Pro account required",
          code: "NOT_PRO",
        });
      }

      const userLevel = PLAN_HIERARCHY[sub.plan] ?? 0;
      const requiredLevel = PLAN_HIERARCHY[minPlan];

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          error: `Plan "${minPlan}" required`,
          code: "INSUFFICIENT_PLAN",
          currentPlan: sub.plan,
        });
      }

      next();
    } catch (err) {
      console.error("[requirePlan] DB error:", err);
      return res.status(500).json({ success: false, error: "Cannot verify subscription" });
    }
  };
}

// ── Initialisation du service (lazy — valide les env vars au démarrage) ──
let instagramService: InstagramService;
try {
  instagramService = new InstagramService(db);
  console.log("✅ InstagramService initialized");
} catch (err: any) {
  console.warn("⚠️  InstagramService not initialized:", err.message);
}

// ── 1. Initier la connexion OAuth Instagram ──
app.get(
  "/api/instagram/connect",
  instagramLimiter,
  authenticateToken,
  requirePlan("signature"),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url } = instagramService.buildAuthUrl(req.user!.id);
      res.json({ success: true, data: { authUrl: url } });
    } catch (err) {
      console.error("[Instagram] buildAuthUrl error:", err);
      res.status(500).json({ success: false, error: "Cannot build auth URL" });
    }
  }
);

// ── 2. Callback OAuth (Instagram redirige ici après autorisation) ──
app.get("/api/instagram/callback", instagramLimiter, async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_error=denied`);
  }

  // Récupérer le proId depuis le state stocké (lecture sans consommation)
  const storedState = instagramService.getStoredState(state);
  if (!storedState) {
    return res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_error=invalid_state`);
  }

  const proId = storedState.proId;

  // Valider et consommer le state (CSRF + HMAC + TTL + one-time)
  if (!instagramService.validateAndConsumeState(state, proId)) {
    return res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_error=state_mismatch`);
  }

  try {
    // Double vérification : plan Signature actif en DB
    const [subRows] = await db.query(
      `SELECT s.id
       FROM subscriptions s
       JOIN users u ON u.id = s.client_id
       WHERE s.client_id = ?
         AND u.role = 'pro'
         AND s.plan = 'signature'
         AND s.status = 'active'
         AND (s.end_date IS NULL OR s.end_date > NOW())
       LIMIT 1`,
      [proId]
    );

    if (!(subRows as any[]).length) {
      return res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_error=plan_required`);
    }

    // Échange du code contre un long-lived token
    const { accessToken, userId, expiresIn } =
      await instagramService.exchangeCodeForLongLivedToken(code);

    // Récupérer le username Instagram
    // Token in Authorization header (not query string) to avoid leaking in server logs
    const profileRes = await fetch(
      "https://graph.instagram.com/me?fields=id,username",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!profileRes.ok) {
      throw new Error(`Failed to fetch IG profile: ${profileRes.status}`);
    }

    const profile = await profileRes.json();

    // Stocker la connexion (UPSERT chiffré)
    await instagramService.saveConnection(
      proId,
      userId,
      profile.username,
      accessToken,
      expiresIn
    );

    // Sync immédiate des photos (fire & forget si lente)
    instagramService
      .fetchAndCachePhotos(proId)
      .catch((e) => console.error("[Instagram] Initial sync error:", e));

    res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_connected=true`);
  } catch (err: any) {
    console.error("[Instagram] OAuth callback error:", err.message);
    res.redirect(`${FRONTEND_URL}/pro/public-profile?ig_error=server_error`);
  }
});

// ── 3. Statut de la connexion Instagram du pro connecté ──
app.get(
  "/api/instagram/status",
  instagramLimiter,
  authenticateToken,
  requirePlan("signature"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await instagramService.getConnectionStatus(req.user!.id);
      res.json({ success: true, data: status });
    } catch (err) {
      console.error("[Instagram] Status error:", err);
      res.status(500).json({ success: false, error: "Cannot fetch status" });
    }
  }
);

// ── 4. Déconnecter Instagram ──
app.delete(
  "/api/instagram/disconnect",
  instagramLimiter,
  authenticateToken,
  requirePlan("signature"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await instagramService.disconnect(req.user!.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Instagram] Disconnect error:", err);
      res.status(500).json({ success: false, error: "Cannot disconnect" });
    }
  }
);

// ── 5. Sync manuelle (throttle 5min) ──
app.post(
  "/api/instagram/sync",
  instagramLimiter,
  authenticateToken,
  requirePlan("signature"),
  async (req: AuthenticatedRequest, res: Response) => {
    const proId = req.user!.id;

    try {
      const { allowed, retryAfterSeconds } =
        await instagramService.canManualSync(proId);

      if (!allowed) {
        return res.status(429).json({
          success: false,
          error: "Sync too frequent. Wait 5 minutes.",
          retryAfterSeconds,
        });
      }

      await instagramService.refreshTokenIfNeeded(proId);
      const ok = await instagramService.fetchAndCachePhotos(proId);
      res.json({ success: ok });
    } catch (err) {
      console.error("[Instagram] Manual sync error:", err);
      res.status(500).json({ success: false, error: "Sync failed" });
    }
  }
);

// ── 6. Endpoint PUBLIC : photos Instagram d'un pro ──
// Pas d'auth requise — vérification plan + visibilité en DB
app.get(
  "/api/public/pro/:proId/instagram",
  publicListingLimiter,
  async (req: Request, res: Response) => {
    const proId = parseInt(req.params.proId as string, 10);

    if (!proId || proId <= 0 || !Number.isInteger(proId)) {
      return res.status(400).json({ success: false, error: "Invalid pro ID" });
    }

    try {
      // Vérifier que ce pro a plan Signature actif + profil public + compte actif
      const [subRows] = await db.query(
        `SELECT s.id
         FROM subscriptions s
         JOIN users u ON u.id = s.client_id
         WHERE s.client_id = ?
           AND u.role = 'pro'
           AND u.pro_status = 'active'
           AND u.profile_visibility = 'public'
           AND s.plan = 'signature'
           AND s.status = 'active'
           AND (s.end_date IS NULL OR s.end_date > NOW())
         LIMIT 1`,
        [proId]
      );

      if (!(subRows as any[]).length) {
        // Ne pas révéler la raison — réponse neutre
        return res.json({ success: true, data: { photos: [], connected: false } });
      }

      // Vérifier connexion Instagram active
      const status = await instagramService.getConnectionStatus(proId);
      if (!status.connected) {
        return res.json({ success: true, data: { photos: [], connected: false } });
      }

      // Photos depuis le cache
      const photos = await instagramService.getCachedPhotos(proId);

      // Si cache vide ou expiré → déclencher re-sync asynchrone (ne pas bloquer)
      const cacheExpired = await instagramService.isCacheExpired(proId);
      if (photos.length === 0 || cacheExpired) {
        instagramService
          .refreshTokenIfNeeded(proId)
          .then(() => instagramService.fetchAndCachePhotos(proId))
          .catch((e) => console.error("[Instagram] Background sync error:", e));
      }

      return res.json({
        success: true,
        data: {
          photos,
          connected: true,
          username: status.username,
        },
      });
    } catch (err) {
      console.error("[Instagram] Public endpoint error:", err);
      // Fallback silencieux : ne pas exposer d'erreur interne
      return res.json({ success: true, data: { photos: [], connected: false } });
    }
  }
);

// ── Cron jobs Instagram ──
// Refresh des tokens qui expirent bientôt (toutes les 6h)
setInterval(async () => {
  if (!instagramService) return;
  console.log("[Instagram CRON] Starting token refresh batch...");
  await instagramService.batchRefreshExpiringTokens().catch((e) =>
    console.error("[Instagram CRON] Refresh error:", e)
  );
}, 6 * 60 * 60 * 1000);

// Re-sync des photos (toutes les 6h, décalé de 30min)
setTimeout(() => {
  setInterval(async () => {
    if (!instagramService) return;
    console.log("[Instagram CRON] Starting photo sync batch...");
    await instagramService.batchSyncPhotos(100).catch((e) =>
      console.error("[Instagram CRON] Sync error:", e)
    );
  }, 6 * 60 * 60 * 1000);
}, 30 * 60 * 1000);

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

// Sentry error handler — must be before custom error handler
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// Must be registered after all routes (Express uses arity to detect error middleware)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  log.error(req.path, err.message, err.stack);

  if (res.headersSent) return;

  if (err instanceof DbTimeoutError) {
    res.set("Retry-After", "30");
    return res.status(503).json({ success: false, message: "Service temporarily unavailable" });
  }

  track5xx();
  res.status(500).json({
    success: false,
    message: "Erreur serveur interne",
    error: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3001;

// Ne pas démarrer le serveur en mode test (permet l'import par supertest)
if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
  });
}

// Process-level crash guards (log + graceful exit on unrecoverable errors)
process.on("uncaughtException", (err) => {
  log.error("process", "UNCAUGHT EXCEPTION — shutting down", err.stack);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  sendAlert("critical", "UNCAUGHT EXCEPTION — server shutting down", { message: err.message }).catch(() => {});
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log.warn("process", "UNHANDLED REJECTION", { reason: msg });
  // Don't exit — let individual route errors surface via error handler
});

export { app };