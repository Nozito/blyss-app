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
import { formatRdvWhen, formatRdvDate, formatRdvTime, formatEuros } from "./lib/notifyDate";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";

// En prod le JS compilé est dans dist/ — les uploads sont dans le dossier parent
const UPLOADS_DIR = path.resolve(
  __dirname,
  process.env.NODE_ENV === "production" ? "../uploads" : "uploads"
);
import sharp from "sharp";
import { sendPushToUser } from "./lib/push";
import { startReminderCron, runReminderCycle } from "./lib/reminders";
import { geocodeCity, haversineKm, jitterCoords } from "./lib/geocoding";
import { startDataRetentionCron } from "./cron/data-retention";
import { startPaymentCleanupCron } from "./cron/payment-cleanup";
import { startSubscriptionExpiryCron } from "./cron/subscription-expiry";
import { startFinanceReportsCron } from "./cron/finance-reports";
import { initiateRefundsForReservation } from "./lib/refunds";
import { getActiveEntitlement } from "./lib/revenuecat";
import { startRecallCron } from "./cron/recall";
import { startDailyRecapCron } from "./cron/daily-recap";
import nailTechRouter, { notifyWaitingList } from "./routes/nail-tech.routes";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
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
  publicListingLimiter,
  adminLimiter,
  pushLimiter,
} from "./middleware/rate-limits";
import { validate, userUpdateSchema, financeObjectiveSchema, prestationSchema, prestationPatchSchema, slotCreateSchema, reservationSchema, reviewSchema, depositSchema, paymentIntentSchema, favoriteSchema, unavailabilitySchema, reservationStatusSchema, liveActivityTokenSchema, liveActivitySettingsSchema } from "./middleware/validate";
import { sendLiveActivityEnd, sendLiveActivityUpdate } from "./lib/apns";
import { applyLiveActivityPrivacy } from "./lib/liveActivityPrivacy";
import authRouter from "./routes/auth.routes";
import adminRouter from "./routes/admin.routes";
import cancellationRouter from "./routes/cancellation.routes";
import { getTopServices, getRevenueStats } from "./lib/finance";

// ==========================================
// 2. CONFIGURATION ENV
// ==========================================
const envFile = process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
const envPath = path.resolve(__dirname, "..", envFile);
console.info("Loading env from:", envPath);

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

if (!process.env.CORS_ORIGINS && process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️  CORS_ORIGINS non défini en production — seul localhost est autorisé. Définir CORS_ORIGINS avec les domaines prod."
  );
}
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:8080"];

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

// Trust reverse proxy (nginx on VPS) — required for express-rate-limit + cookies
app.set("trust proxy", 1);

// Security headers (before anything else, after Stripe raw-body route)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", "data:", "blob:"],
        connectSrc:     ["'self'"],
        fontSrc:        ["'self'"],
        objectSrc:      ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
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

    log.warn("/api/webhooks/stripe", `Event: ${event.type}, id: ${event.id}`);

    let connection;
    try {
      connection = await db.getConnection();

      // ── Idempotence : un event.id Stripe ne s'exécute qu'une fois ──────────
      // Stripe retente la livraison sur tout non-2xx ou timeout ; sans ce
      // contrôle, un simple renvoi rejouerait les effets (crédit double, etc).
      const [existing] = await connection.execute(
        `SELECT event_id FROM stripe_events WHERE event_id = ?`,
        [event.id]
      );
      if ((existing as any[]).length > 0) {
        log.info("/api/webhooks/stripe", 200, 0);
        return res.status(200).json({ received: true, message: "Already processed" });
      }

      await connection.beginTransaction();

      // Enregistrer l'event en premier (garantit l'idempotence même si le
      // traitement plante après ce point : un retry retrouvera la ligne et
      // ne rejouera rien).
      await connection.execute(
        `INSERT INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, NOW())`,
        [event.id, event.type]
      );

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await connection.execute(
            `UPDATE payments SET status = 'succeeded', updated_at = NOW() WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          // Get payment info to update reservation
          const [paymentRows] = await connection.query(
            `SELECT reservation_id, amount, type FROM payments WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          const payment = (paymentRows as any[])[0];
          if (payment) {
            const newStatus = payment.type === "deposit" ? "deposit_paid" : "fully_paid";
            await connection.execute(
              `UPDATE reservations SET payment_status = ?, total_paid = total_paid + ? WHERE id = ?`,
              [newStatus, payment.amount, payment.reservation_id]
            );

            // Notify the pro that a payment/deposit landed (best-effort)
            try {
              const [resaRows] = await connection.query(
                `SELECT r.pro_id, r.start_datetime, u.first_name, u.last_name
                 FROM reservations r
                 JOIN users u ON u.id = r.client_id
                 WHERE r.id = ?`,
                [payment.reservation_id]
              );
              const resa = (resaRows as any[])[0];
              const proId = resa?.pro_id;
              if (proId) {
                const amountLabel = formatEuros(Number(payment.amount) || 0);
                const title = payment.type === "deposit" ? "Acompte encaissé" : "Paiement encaissé";
                const clientName = resa.first_name ? `${resa.first_name} ${resa.last_name}` : "Une cliente";
                const when = resa.start_datetime ? ` pour le RDV du ${formatRdvWhen(new Date(resa.start_datetime))}` : "";
                const message = `${clientName} a réglé ${amountLabel} €${payment.type === "deposit" ? " d'acompte" : ""}${when}.`;
                const [notifRows] = await connection.query(
                  `INSERT INTO notifications (user_id, type, title, message, data)
                   VALUES (?, 'payment_received', ?, ?, ?)
                   RETURNING id, created_at`,
                  [proId, title, message, JSON.stringify({ reservation_id: payment.reservation_id })]
                );
                const notif = (notifRows as any[])[0];
                if (notif) {
                  await sendNotificationToUser(proId, {
                    id: notif.id,
                    type: "payment_received",
                    title,
                    message,
                    data: { reservation_id: payment.reservation_id },
                    created_at: notif.created_at,
                  });
                }
              }
            } catch (notifErr) {
              log.warn("/api/webhooks/stripe", "payment_received notification error (non-fatal)", { piId: pi.id });
            }
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data.object as Stripe.PaymentIntent;
          await connection.execute(
            `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          // Notify client that payment failed so they can retry
          const [failedPayRows] = await connection.query(
            `SELECT client_id, reservation_id, amount FROM payments WHERE stripe_payment_intent_id = ?`,
            [pi.id]
          );
          const failedPay = (failedPayRows as any[])[0];
          if (failedPay) {
            try {
              const failedAmount = formatEuros(Number(failedPay.amount) || 0);
              const failedMessage = `Ton paiement de ${failedAmount} € a été refusé. Réessaie avec une autre carte.`;
              const [notifRows] = await connection.query(
                `INSERT INTO notifications (user_id, type, title, message, data)
                 VALUES (?, 'payment_failed', 'Paiement échoué', ?, ?)
                 RETURNING id, created_at`,
                [failedPay.client_id, failedMessage, JSON.stringify({ reservation_id: failedPay.reservation_id })]
              );
              const notif = (notifRows as any[])[0];
              if (notif) {
                await sendNotificationToUser(failedPay.client_id, {
                  id: notif.id,
                  type: "payment_failed",
                  title: "Paiement échoué",
                  message: failedMessage,
                  data: { reservation_id: failedPay.reservation_id },
                  created_at: notif.created_at,
                });
              }
            } catch (notifErr) {
              log.warn("/api/webhooks/stripe", "payment_failed notification error (non-fatal)", { piId: pi.id });
            }
          }
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const piId = charge.payment_intent as string;
          if (piId) {
            // Mark payment as refunded (may already be set by initiateRefundsForReservation, idempotent)
            await connection.execute(
              `UPDATE payments
               SET status = 'refunded', refund_amount = COALESCE(refund_amount, amount), updated_at = NOW()
               WHERE stripe_payment_intent_id = ? AND status != 'refunded'`,
              [piId]
            );
            // Check if all payments for the reservation are now refunded → reset payment_status
            const [chargePayRows] = await connection.query(
              `SELECT reservation_id, client_id FROM payments WHERE stripe_payment_intent_id = ?`,
              [piId]
            );
            const chargePay = (chargePayRows as any[])[0];
            if (chargePay) {
              const [pendingRows] = await connection.query(
                `SELECT COUNT(*) AS cnt FROM payments
                 WHERE reservation_id = ? AND status = 'succeeded'`,
                [chargePay.reservation_id]
              );
              const remainingSucceeded = Number((pendingRows as any[])[0]?.cnt ?? 0);
              if (remainingSucceeded === 0) {
                await connection.execute(
                  `UPDATE reservations SET payment_status = 'unpaid', total_paid = 0 WHERE id = ?`,
                  [chargePay.reservation_id]
                );
              }
              // Notify client of the refund (best-effort)
              try {
                const refundAmount = formatEuros((charge.amount_refunded ?? 0) / 100);
                const refundMessage = `Ton remboursement de ${refundAmount} € a été initié. Il apparaîtra sous 5 à 10 jours ouvrés.`;
                const [notifRows] = await connection.query(
                  `INSERT INTO notifications (user_id, type, title, message, data)
                   VALUES (?, 'payment_refunded', 'Remboursement initié', ?, ?)
                   RETURNING id, created_at`,
                  [chargePay.client_id, refundMessage, JSON.stringify({ reservation_id: chargePay.reservation_id })]
                );
                const notif = (notifRows as any[])[0];
                if (notif) {
                  await sendNotificationToUser(chargePay.client_id, {
                    id: notif.id,
                    type: "payment_refunded",
                    title: "Remboursement initié",
                    message: refundMessage,
                    data: { reservation_id: chargePay.reservation_id },
                    created_at: notif.created_at,
                  });
                }
              } catch (notifErr) {
                log.warn("/api/webhooks/stripe", "charge.refunded notification error (non-fatal)", { piId });
              }
            }
          }
          break;
        }
        default:
          log.warn("/api/webhooks/stripe", `Unhandled event type: ${event.type}`);
      }

      await connection.commit();
      return res.status(200).json({ received: true });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch {
          // rollback best-effort — the connection may already be broken
        }
      }
      log.error("/api/webhooks/stripe", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
      return res.status(500).json({ error: "Webhook processing failed" });
    } finally {
      connection?.release();
    }
  }
);

app.use(express.json());
app.use(cookieParser());

// authMiddleware / authenticateToken → middleware/auth.ts (importé en haut)

// ── Routeurs extraits ──────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/admin", adminLimiter, adminRouter);

// ── Guard global sur toutes les routes /api/pro/* ──────────────────────────
// Vérifie en DB que le user est un pro avec un abonnement actif.
// Whitelist : routes accessibles sans abonnement (consultation/souscription).
const PRO_SUBSCRIPTION_WHITELIST = [
  "/subscription",
  "/subscription/cancel",
  "/subscription/checkout",
  "/subscription/sync",
  "/onboarding",
];

// Une seule requête DB pour vérifier role + is_admin + pro_status
async function requireProAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: "non_authentifie" });
    return;
  }

  const [rows] = await db.query(
    "SELECT role, is_admin, pro_status FROM users WHERE id = ?",
    [userId]
  );
  const user = (rows as any[])[0];

  if (!user) {
    res.status(401).json({ success: false, error: "non_authentifie" });
    return;
  }

  // Admins passent toujours
  if (user.is_admin === 1) return next();

  // Doit être un pro
  if (user.role !== "pro") {
    res.status(403).json({ success: false, error: "pro_required" });
    return;
  }

  // Routes whitelistées : pas besoin d'abonnement actif (souscription, onboarding)
  const path = req.path;
  if (PRO_SUBSCRIPTION_WHITELIST.some((p) => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // Toutes les autres routes pro : abonnement actif requis (vérifié en DB, pas en JWT)
  if (user.pro_status !== "active") {
    res.status(403).json({ success: false, error: "subscription_required" });
    return;
  }

  next();
}

app.use("/api/pro", authMiddleware, requireProAccess);

app.use("/api/pro", router);
app.use("/api", cancellationRouter);
app.use("/api", nailTechRouter);

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
          `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
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
          `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`,
          [ws.userId]
        );

        ws.send(
          JSON.stringify({
            type: "mark_all_read_success",
          })
        );
      }

    } catch (error) {
      log.error("/ws/message", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
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
    }
  });

  ws.on("error", (error) => {
    log.error("/ws/error", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
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
});


// ==========================================
// REVENUECAT WEBHOOK (no auth middleware - uses its own secret)
// ==========================================

app.post("/api/webhooks/revenuecat", async (req: Request, res: Response) => {
  let connection;
  try {
    // ── 1. Vérification du secret ────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const event = req.body?.event;
    if (!event) {
      return res.status(400).json({ success: false, message: "No event in body" });
    }

    // ── 2. Champs obligatoires ───────────────────────────────────────────────
    const eventId: string = event.id;
    const eventType: string = event.type;
    const appUserId: string = event.app_user_id;
    const productId: string = event.product_id ?? "";
    const entitlementIds: string[] = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
    const expirationAtMs: number | null = event.expiration_at_ms ?? null;

    if (!eventId) {
      log.warn("/api/webhooks/revenuecat", "Event sans id — rejeté");
      return res.status(400).json({ success: false, message: "Missing event.id" });
    }
    if (!appUserId) {
      return res.status(400).json({ success: false, message: "Missing app_user_id" });
    }

    const userId = parseInt(appUserId, 10);
    if (isNaN(userId)) {
      log.warn("/api/webhooks/revenuecat", `app_user_id non numérique : ${appUserId}`);
      return res.status(400).json({ success: false, message: "Invalid app_user_id (not a numeric id)" });
    }

    connection = await db.getConnection();

    // ── 3. Idempotence : un event_id ne s'exécute qu'une fois ───────────────
    const [existing] = await connection.execute(
      `SELECT event_id FROM revenuecat_events WHERE event_id = ?`,
      [eventId]
    );
    if ((existing as any[]).length > 0) {
      log.info("/api/webhooks/revenuecat", 200, 0, userId);
      return res.status(200).json({ success: true, message: "Already processed" });
    }

    // ── 4. Vérifier que l'userId existe ET est un pro ────────────────────────
    const [userRows] = await connection.execute(
      `SELECT id, role FROM users WHERE id = ?`,
      [userId]
    );
    const user = (userRows as any[])[0];
    if (!user || user.role !== "pro") {
      log.warn("/api/webhooks/revenuecat", `userId ${userId} introuvable ou pas pro (role: ${user?.role})`);
      // On répond 200 pour éviter que RC ne réessaie indéfiniment
      return res.status(200).json({ success: true, message: "User not applicable" });
    }

    // ── 5. Traitement dans une transaction ───────────────────────────────────
    await connection.beginTransaction();
    try {
      // Enregistrer l'event en premier (idempotence garantie)
      await connection.execute(
        `INSERT INTO revenuecat_events (event_id, event_type, user_id, processed_at) VALUES (?, ?, ?, NOW())`,
        [eventId, eventType, userId]
      );

      // Prefer RevenueCat's own entitlement_ids (identifiers are exactly
      // "start"/"serenite"/"signature", matching what the client checks via
      // hasProEntitlement()) over guessing from the product_id string, which
      // silently falls through to "start" for any SKU that doesn't literally
      // contain "signature"/"serenite" (renamed SKU, promo product, Android
      // naming, etc).
      const PLAN_PRIORITY = ["signature", "serenite", "start"] as const;
      let plan: string =
        PLAN_PRIORITY.find((p) => entitlementIds.includes(p)) ??
        (productId.includes("signature") ? "signature" : productId.includes("serenite") ? "serenite" : "start");
      const billingType = productId.includes("annual") ? "one_time" : "monthly";

      const activateEvents = ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"];
      const deactivateEvents = ["CANCELLATION", "EXPIRATION"];

      if (activateEvents.includes(eventType)) {
        const startDate = new Date().toISOString().slice(0, 10);
        const endDate = expirationAtMs ? new Date(expirationAtMs).toISOString().slice(0, 10) : null;

        await connection.execute(
          `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
          [userId]
        );
        await connection.execute(
          `INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
           VALUES (?, ?, ?, 0, NULL, NULL, ?, ?, 'active', ?)`,
          [userId, plan, billingType, startDate, endDate, `rc_${eventId}`]
        );
        await connection.execute(
          `UPDATE users SET pro_status = 'active' WHERE id = ?`,
          [userId]
        );
        log.info("/api/webhooks/revenuecat/activate", 200, 0, userId);

      } else if (deactivateEvents.includes(eventType)) {
        // An admin-granted subscription (payment_id='admin_grant') has no
        // real RevenueCat purchase behind it. If this event is about to
        // cancel one, it means either a stray/unrelated RC event landed for
        // this user, or the admin grant is being legitimately superseded —
        // either way, nobody would otherwise know this happened.
        const [activeRows] = await connection.query(
          `SELECT payment_id FROM subscriptions WHERE client_id = ? AND status = 'active' LIMIT 1`,
          [userId]
        );
        const activePaymentId = (activeRows as any[])[0]?.payment_id;
        if (activePaymentId === "admin_grant") {
          await sendAlert("warn", "RevenueCat webhook is deactivating an admin-granted subscription", {
            userId,
            eventType,
            eventId,
          }).catch(() => {});
        }

        await connection.execute(
          `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
          [userId]
        );
        await connection.execute(
          `UPDATE users SET pro_status = 'inactive' WHERE id = ?`,
          [userId]
        );
        log.info("/api/webhooks/revenuecat/deactivate", 200, 0, userId);

      } else if (eventType === "BILLING_ISSUE") {
        // Renewal failed — RevenueCat/StoreKit grace period keeps access
        // alive for now (a later EXPIRATION event will deactivate if the
        // billing issue is never resolved), but the pro should know their
        // card needs attention rather than silently losing access later
        // with no warning.
        try {
          const [notifRows] = await connection.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'subscription_billing_issue', 'Problème de paiement', ?, ?)
             RETURNING id, created_at`,
            [
              userId,
              "Le renouvellement de ton abonnement Blyss Pro a échoué. Mets à jour ton moyen de paiement pour ne pas perdre l'accès.",
              JSON.stringify({}),
            ]
          );
          const notif = (notifRows as any[])[0];
          if (notif) {
            await sendNotificationToUser(userId, {
              id: notif.id,
              type: "subscription_billing_issue",
              title: "Problème de paiement",
              message: "Le renouvellement de ton abonnement Blyss Pro a échoué. Mets à jour ton moyen de paiement pour ne pas perdre l'accès.",
              data: {},
              created_at: notif.created_at,
            });
          }
        } catch (notifErr) {
          log.warn("/api/webhooks/revenuecat", "billing_issue notification error (non-fatal)", { userId } as any);
        }
        log.warn("/api/webhooks/revenuecat", `BILLING_ISSUE for user ${userId} (grace period, no state change)`);

      } else {
        log.warn("/api/webhooks/revenuecat", `Unhandled event type: ${eventType}`);
      }

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    log.error("/api/webhooks/revenuecat", error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
    return res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
});

// ==========================================
// API ROUTES - NOTIFICATIONS → routes/admin.routes.ts
// ==========================================

/* Toutes les routes /api/admin/* sont dans routes/admin.routes.ts */

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
  latitude?: number | null;
  longitude?: number | null;
  geo_precision?: "address" | "city" | null;
  address_line?: string | null;
  postal_code?: string | null;
  service_radius_km?: number | null;
  service_area_label?: string | null;
}

interface UpdatePaymentsBody {
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proId = parseParamToInt(req.params.proId);

      if (isNaN(proId)) {
        return res.status(400).json({
          success: false,
          message: "ID invalide"
        });
      }

      const [rows] = await db.query(
        `SELECT
          id, first_name, last_name, activity_name, city,
          instagram_account, profile_photo, banner_photo, bio, acceptance_conditions, pro_status,
          accept_online_payment, stripe_onboarding_complete,
          geo_precision, address_line, postal_code, latitude, longitude,
          public_latitude, public_longitude, service_radius_km, service_area_label
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

      // Whitelist, not blacklist: build the public payload field-by-field rather than
      // stripping from the full row, so a forgotten SELECT column never leaks by default.
      const addressVisible = pro.geo_precision === "address";
      const {
        geo_precision, address_line, postal_code,
        latitude, longitude, public_latitude, public_longitude,
        service_radius_km, service_area_label,
        ...base
      } = pro;

      const data = {
        ...base,
        address_visible: addressVisible,
        // latitude/longitude are always present — the map preview on the client needs a
        // point to draw regardless of privacy choice; only the precision differs (exact
        // pin vs. jittered public point, same rule the list/map search endpoint applies).
        latitude: addressVisible ? latitude : public_latitude,
        longitude: addressVisible ? longitude : public_longitude,
        ...(addressVisible
          ? { address_line, postal_code }
          : { service_radius_km, service_area_label }),
      };

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

/* GET PRESTATIONS BY PRO (PUBLIC) */
app.get(
  "/api/prestations/pro/:id",
  async (req: Request, res: Response, next: NextFunction) => {
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
      next(error);
    }
  }
);

/* GET PORTFOLIO GALLERY BY PRO (PUBLIC) — profil public vu par une cliente */
app.get(
  "/api/gallery/pro/:id",
  publicListingLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proId = parseParamToInt(req.params.id);
      if (proId === null) {
        return res.status(400).json({ success: false, message: "ID invalide" });
      }

      const [rows] = await db.query(
        "SELECT id, url, thumbnail, created_at FROM gallery_images WHERE pro_id = ? ORDER BY created_at DESC",
        [proId]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================
   SLOTS & AVAILABILITY ROUTES
   ============================================ */

// GET: Récupérer les créneaux disponibles pour un pro sur une date donnée
app.get(
  "/api/slots/available/:proId/:date",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proId = parseParamToInt(req.params.proId);
      const dateStr = req.params.date; // Format: YYYY-MM-DD

      // Récupérer les slots disponibles pour la date (comparaison date locale stockée)
      const [availableSlots] = await db.query(
        `SELECT s.id, TO_CHAR(s.start_datetime, 'HH24:MI') AS time, s.duration,
                s.start_datetime, s.end_datetime
         FROM slots s
         JOIN users u ON u.id = s.pro_id
         WHERE s.pro_id = ?
         AND s.status = 'available'
         AND s.start_datetime::date = ?::date
         AND s.start_datetime > NOW()
         AND u.pro_status = 'active'
         AND u.is_active = TRUE
         ORDER BY s.start_datetime ASC`,
        [proId, dateStr]
      );

      const formattedSlots = availableSlots as any[];

      res.json({ success: true, data: formattedSlots });
    } catch (error) {
      next(error);
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
      const [slotRows] = await db.query(
        `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
         VALUES (?, ?, ?, ?, 'available') RETURNING id`,
        [proId, start_datetime, end_datetime, duration ?? 60]
      );

      res.json({
        success: true,
        message: "Créneau créé",
        data: { id: (slotRows as any[])[0]?.id }
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

      const [result] = await db.query(
        `SELECT DISTINCT TO_CHAR(s.start_datetime, 'YYYY-MM-DD') as available_date
         FROM slots s
         JOIN users u ON u.id = s.pro_id
         WHERE s.pro_id = ?
         AND s.status = 'available'
         AND s.start_datetime > NOW()
         AND EXTRACT(YEAR FROM s.start_datetime) = ?
         AND EXTRACT(MONTH FROM s.start_datetime) = ?
         AND u.pro_status = 'active'
         AND u.is_active = TRUE
         ORDER BY available_date ASC`,
        [proId, year, monthNumber]
      );

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

// ─── Guard abonnement actif — routes prestations uniquement ──────────────────
// Vérifie en DB que le pro a pro_status = 'active'.
// NE PAS mettre en router.use() : ça s'appliquerait à TOUS les /api/pro/* (y compris
// les routes app-level) ce qui casserait les tests et routes sans abonnement.
async function requireActiveProSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: "non_authentifie" });
    return;
  }
  const [rows] = await db.query(
    "SELECT pro_status FROM users WHERE id = ? AND role = 'pro'",
    [userId]
  );
  if ((rows as any[])[0]?.pro_status !== "active") {
    res.status(403).json({ success: false, error: "subscription_required" });
    return;
  }
  next();
}

// ===== GET /api/pro/prestations =====
router.get('/prestations', authMiddleware, requireActiveProSubscription, async (req: any, res: any) => {
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
router.post('/prestations', authMiddleware, validate(prestationSchema), requireActiveProSubscription, async (req: any, res: any) => {
  try {
    const { name, description, price, duration_minutes, active } = req.body;
    const [prestRows] = await db.query(
      `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      [req.user!.id, name, description, price, duration_minutes, active]
    );
    res.status(201).json({ success: true, data: (prestRows as any[])[0] });
  } catch (error) {
    console.error('POST /prestations error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== PATCH /api/pro/prestations/:id =====
router.patch('/prestations/:id', authMiddleware, validate(prestationPatchSchema), requireActiveProSubscription, async (req: any, res: any) => {
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
router.delete('/prestations/:id', authMiddleware, requireActiveProSubscription, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    // Delete and check if existed
    const [result] = await db.query(
      'DELETE FROM prestations WHERE id = ? AND pro_id = ? RETURNING id',
      [id, req.user!.id]
    );
    if ((result as any[]).length === 0) {
      return res.status(404).json({ success: false, error: 'Prestation introuvable' });
    }
    res.json({ success: true, data: { id: parseInt(id) } });
  } catch (error) {
    console.error('DELETE /prestations/:id error:', error);
    // Postgres refuses the delete if any reservation (past or future) still
    // references this prestation — expected and desirable (keeps historical
    // bookings intact), but the pro needs an actionable message instead of
    // a raw 500. They can deactivate it instead via PATCH { active: false }.
    if ((error as { code?: string })?.code === '23503') {
      return res.status(409).json({
        success: false,
        error: "Impossible de supprimer cette prestation : elle a des réservations associées. Désactive-la plutôt pour qu'elle n'apparaisse plus aux clientes.",
      });
    }
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ===== POST /api/pro/prestations/:id/duplicate =====
router.post('/prestations/:id/duplicate', authMiddleware, requireActiveProSubscription, async (req: any, res: any) => {
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
    const [dupRows] = await db.query(
      `INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        req.user!.id,
        `${presta.name} (copie)`,
        presta.description,
        presta.price,
        presta.duration_minutes,
        false // désactivée par défaut
      ]
    );
    res.status(201).json({ success: true, data: (dupRows as any[])[0] });
  } catch (error) {
    console.error('POST /prestations/:id/duplicate error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/auth/profile → routes/auth.routes.ts

// =====================
// FINANCE PRO ROUTES (Signature only)
// =====================

// Shared guard for plan-gated pro endpoints — checks pro is active AND
// their subscription plan is at least `minPlan` in the Start < Sérénité <
// Signature hierarchy.
type Plan = "start" | "serenite" | "signature";
const PLAN_RANK: Record<Plan, number> = { start: 1, serenite: 2, signature: 3 };
const PLAN_LABEL: Record<Plan, string> = { start: "Start", serenite: "Sérénité", signature: "Signature" };

async function requirePlan(
  userId: number,
  minPlan: Plan
): Promise<{ ok: true; plan: Plan } | { ok: false; status: number; error: string }> {
  const [userRows]: any = await db.query(
    "SELECT role, pro_status FROM users WHERE id = ?",
    [userId]
  );
  const user = userRows?.[0];
  if (!user || user.role !== "pro" || user.pro_status !== "active") {
    return { ok: false, status: 403, error: "Accès réservé aux professionnels actifs" };
  }

  const [subscriptionRows]: any = await db.query(
    "SELECT plan, status FROM subscriptions WHERE client_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
    [userId]
  );
  const subscription = subscriptionRows?.[0];
  if (!subscription || subscription.status !== "active") {
    return { ok: false, status: 403, error: "Aucun abonnement actif" };
  }
  const plan = subscription.plan as Plan;
  if (PLAN_RANK[plan] < PLAN_RANK[minPlan]) {
    return {
      ok: false,
      status: 403,
      error: `Fonctionnalité réservée à l'abonnement ${PLAN_LABEL[minPlan]} ou supérieur (actuel : ${PLAN_LABEL[plan] ?? plan})`,
    };
  }

  return { ok: true, plan };
}

// =====================
// LIVE ACTIVITY ROUTES (iOS lock screen / Dynamic Island — Live RDV)
// =====================

// GET /api/pro/live-activity/next-appointment
app.get("/api/pro/live-activity/next-appointment", authenticateToken, async (req: any, res) => {
  try {
    const guard = await requirePlan(req.user.id, "start");
    if (!guard.ok) return res.status(guard.status).json({ success: false, error: guard.error });
    const userId = req.user.id;

    const [userRows]: any = await db.query(
      "SELECT live_activity_enabled, live_activity_privacy FROM users WHERE id = ?",
      [userId]
    );
    const settings = userRows?.[0];
    if (!settings?.live_activity_enabled) {
      return res.json({ success: true, data: null });
    }

    const [rows]: any = await db.query(
      `SELECT r.id, r.start_datetime, r.end_datetime, p.name AS prestation_name, u.first_name AS client_first_name
       FROM reservations r
       JOIN prestations p ON p.id = r.prestation_id
       JOIN users u ON u.id = r.client_id
       WHERE r.pro_id = ? AND r.status = 'confirmed' AND r.end_datetime > NOW()
       ORDER BY r.start_datetime ASC
       LIMIT 1`,
      [userId]
    );
    const next = rows?.[0];
    if (!next) return res.json({ success: true, data: null });

    const { clientFirstName, showTime } = applyLiveActivityPrivacy(
      settings.live_activity_privacy,
      next.client_first_name
    );

    res.json({
      success: true,
      data: {
        appointmentId: next.id,
        startAt: next.start_datetime,
        endAt: next.end_datetime,
        prestationName: settings.live_activity_privacy === "full" ? next.prestation_name : null,
        clientFirstName,
        showTime,
        privacyLevel: settings.live_activity_privacy,
      },
    });
  } catch (err) {
    console.error("[LIVE ACTIVITY next-appointment] error =", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// GET /api/pro/live-activity/settings
app.get("/api/pro/live-activity/settings", authenticateToken, async (req: any, res) => {
  try {
    const [rows]: any = await db.query(
      "SELECT live_activity_enabled, live_activity_privacy FROM users WHERE id = ?",
      [req.user.id]
    );
    const settings = rows?.[0];
    res.json({
      success: true,
      data: {
        enabled: settings?.live_activity_enabled ?? true,
        privacy: settings?.live_activity_privacy ?? "full",
      },
    });
  } catch (err) {
    console.error("[LIVE ACTIVITY settings GET] error =", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// PUT /api/pro/live-activity/settings
app.put(
  "/api/pro/live-activity/settings",
  authenticateToken,
  validate(liveActivitySettingsSchema),
  async (req: any, res) => {
    try {
      const { enabled, privacy } = req.body;
      const userId = req.user.id;

      if (enabled === undefined && privacy === undefined) {
        return res.status(400).json({ success: false, error: "Aucun champ à mettre à jour" });
      }

      // Disabling ends any tokens we hold — nothing further should be pushed
      // to this pro's lock screen until they re-enable it.
      if (enabled === false) {
        await db.query("DELETE FROM live_activity_tokens WHERE user_id = ?", [userId]);
      }

      const sets: string[] = [];
      const params: any[] = [];
      if (enabled !== undefined) {
        sets.push("live_activity_enabled = ?");
        params.push(enabled);
      }
      if (privacy !== undefined) {
        sets.push("live_activity_privacy = ?");
        params.push(privacy);
      }
      params.push(userId);
      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);

      res.json({ success: true });
    } catch (err) {
      console.error("[LIVE ACTIVITY settings PUT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  }
);

// POST /api/pro/live-activity/tokens — register a push-to-start or per-activity update token
app.post(
  "/api/pro/live-activity/tokens",
  authenticateToken,
  validate(liveActivityTokenSchema),
  async (req: any, res) => {
    try {
      const { kind, token, activityId, reservationId } = req.body;
      const userId = req.user.id;

      if (kind === "update" && !activityId) {
        return res.status(400).json({ success: false, error: "activityId requis pour un token 'update'" });
      }

      // reservationId is trusted here only to attach metadata for the cron/mutation
      // hooks to look up — ownership is enforced by scoping every subsequent
      // query to (user_id = req.user.id), never trusting reservationId alone.
      if (reservationId) {
        const [resRows]: any = await db.query(
          "SELECT id FROM reservations WHERE id = ? AND pro_id = ?",
          [reservationId, userId]
        );
        if (!resRows?.[0]) {
          return res.status(403).json({ success: false, error: "Réservation invalide" });
        }
      }

      await db.query(
        `INSERT INTO live_activity_tokens (user_id, kind, activity_id, reservation_id, push_token, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON CONFLICT (user_id, kind, activity_id)
         DO UPDATE SET push_token = EXCLUDED.push_token, reservation_id = EXCLUDED.reservation_id, updated_at = NOW()`,
        [userId, kind, activityId ?? null, reservationId ?? null, token]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("[LIVE ACTIVITY tokens POST] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  }
);

// DELETE /api/pro/live-activity/tokens — teardown (logout, activity ended client-side)
app.delete("/api/pro/live-activity/tokens", authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const activityId = req.query.activityId as string | undefined;

    if (activityId) {
      await db.query(
        "DELETE FROM live_activity_tokens WHERE user_id = ? AND kind = 'update' AND activity_id = ?",
        [userId, activityId]
      );
    } else {
      // No activityId — full teardown (logout, subscription lost): drop every
      // token for this user, including the push-to-start one.
      await db.query("DELETE FROM live_activity_tokens WHERE user_id = ?", [userId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[LIVE ACTIVITY tokens DELETE] error =", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

/**
 * Pushes a remote update/end to a reservation's Live Activity, if the pro
 * has a registered update token for it. Best-effort: swallows all errors,
 * since a failed push must never abort the reservation mutation that
 * triggered it (annulation/reprogrammation succeeds regardless).
 *
 * For "update", the full content-state is re-fetched and rebuilt here
 * (rather than accepting a partial payload from callers) — ActivityKit
 * content-state pushes replace the whole struct, so a partial payload would
 * blank out fields the widget expects (client first name, prestation name).
 */
async function pushLiveActivityMutation(reservationId: number, kind: "update" | "end"): Promise<void> {
  try {
    const [tokenRows]: any = await db.query(
      "SELECT push_token FROM live_activity_tokens WHERE reservation_id = ? AND kind = 'update' LIMIT 1",
      [reservationId]
    );
    const token = tokenRows?.[0]?.push_token;
    if (!token) return;

    if (kind === "end") {
      await sendLiveActivityEnd(token);
      await db.query(
        "DELETE FROM live_activity_tokens WHERE reservation_id = ? AND kind = 'update'",
        [reservationId]
      );
      return;
    }

    const [rows]: any = await db.query(
      `SELECT r.start_datetime, r.end_datetime, p.name AS prestation_name,
              u_client.first_name AS client_first_name,
              u_pro.live_activity_privacy AS privacy
       FROM reservations r
       LEFT JOIN prestations p ON p.id = r.prestation_id
       JOIN users u_client ON u_client.id = r.client_id
       JOIN users u_pro ON u_pro.id = r.pro_id
       WHERE r.id = ?`,
      [reservationId]
    );
    const row = rows?.[0];
    if (!row) return;

    const { clientFirstName, showTime } = applyLiveActivityPrivacy(row.privacy, row.client_first_name);
    await sendLiveActivityUpdate(token, {
      startAt: row.start_datetime,
      endAt: row.end_datetime,
      prestationName: row.privacy === "full" ? row.prestation_name : null,
      clientFirstName,
      showTime,
      privacyLevel: row.privacy,
    });
  } catch (err) {
    log.warn("live-activity", "push mutation failed (non-fatal)", { reservationId, kind });
  }
}

// GET /api/pro/finance/stats - Dashboard Finance
app.get("/api/pro/finance/stats", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;
  try {
    const userId = req.user.id;

    log.info("/api/pro/finance/stats", 200, 0, userId);

    // === 1. Vérifier pro actif + abonnement (CA temps réel = dès Start) ===
    const guard = await requirePlan(userId, "start");
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const plan = guard.plan;

    const [userRows]: any = await db.query(
      "SELECT monthly_objective FROM users WHERE id = ?",
      [userId]
    );
    const user = userRows?.[0];

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
    // Semaine ISO (lundi → aujourd'hui) — getDay() renvoie 0 pour dimanche
    const mondayOffset = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - mondayOffset);
    const startOfWeekStr = startOfWeek.toISOString().split("T")[0];

    // === 4. CA (sur reservations.start_datetime) ===
    const [[{ total: todayTotal }]]: any = await db.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM reservations
       WHERE pro_id = ?
       AND start_datetime::date = ?
       AND status IN ('confirmed','completed')`,
      [userId, today]
    );

    const [[{ total: weekTotal }]]: any = await db.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM reservations
       WHERE pro_id = ?
       AND start_datetime::date BETWEEN ? AND ?
       AND status IN ('confirmed','completed')`,
      [userId, startOfWeekStr, today]
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
    const weekTotalNum = Number(weekTotal) || 0;
    const monthTotalNum = Number(monthTotal) || 0;
    const lastMonthTotalNum = Number(lastMonthTotal) || 0;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const forecastNum =
      monthTotalNum + (monthTotalNum / Math.max(now.getDate(), 1)) * (daysInMonth - now.getDate());

    // === 6. Tendance + top prestations (Statistiques détaillées = Sérénité+) ===
    const isSereniteOrAbove = PLAN_RANK[plan] >= PLAN_RANK.serenite;
    let trend: "up" | "down" | "stable" | undefined;
    let topServices: Awaited<ReturnType<typeof getTopServices>> | undefined;
    if (isSereniteOrAbove) {
      trend = "stable";
      if (monthTotalNum > lastMonthTotalNum * 1.05) trend = "up";
      else if (monthTotalNum < lastMonthTotalNum * 0.95) trend = "down";
      topServices = await getTopServices(db, userId, startOfMonth, today, 5);
    }

    // === 7. Prévision du CA (Signature uniquement) ===
    const forecast = plan === "signature" && Number.isFinite(forecastNum) ? Math.round(forecastNum) : undefined;

    return res.json({
      success: true,
      data: {
        plan,
        today: todayTotalNum,
        week: weekTotalNum,
        month: monthTotalNum,
        lastMonth: lastMonthTotalNum,
        objective: Number(user?.monthly_objective ?? 0),
        ...(forecast !== undefined ? { forecast } : {}),
        ...(trend !== undefined ? { trend } : {}),
        ...(topServices !== undefined ? { topServices } : {}),
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

    // 1) Vérifier pro actif + abonnement (objectif = dashboard CA, dès Start)
    const guard = await requirePlan(userId, "start");
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }

    // 3) Update
    await db.query("UPDATE users SET monthly_objective = ? WHERE id = ?", [
      Math.round(objective),
      userId,
    ]);

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

// GET /api/pro/finance/reports - Historique des rapports auto (hebdo/mensuel)
app.get("/api/pro/finance/reports", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;
  try {
    const userId = req.user.id;
    const guard = await requirePlan(userId, "signature");
    if (!guard.ok) return res.status(guard.status).json({ success: false, error: guard.error });

    const [rows] = await db.query(
      `SELECT id, period_type, period_start, period_end, revenue, previous_revenue,
              bookings_count, avg_basket, viewed_at, created_at
       FROM finance_reports
       WHERE pro_id = ?
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );

    return res.json({
      success: true,
      data: (rows as any[]).map((r) => ({
        id: r.id,
        periodType: r.period_type,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        revenue: Number(r.revenue) || 0,
        previousRevenue: Number(r.previous_revenue) || 0,
        bookingsCount: Number(r.bookings_count) || 0,
        avgBasket: Number(r.avg_basket) || 0,
        viewedAt: r.viewed_at,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error(`[FINANCE_REPORTS][${rid}] ERROR`, error);
    return res.status(500).json({ success: false, error: "Erreur lors du chargement des rapports" });
  }
});

// GET /api/pro/finance/reports/:id - Détail d'un rapport (marque comme vu)
app.get("/api/pro/finance/reports/:id", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;
  try {
    const userId = req.user.id;
    const guard = await requirePlan(userId, "signature");
    if (!guard.ok) return res.status(guard.status).json({ success: false, error: guard.error });

    const reportId = parseParamToInt(req.params.id);
    if (reportId === null) {
      return res.status(400).json({ success: false, error: "Identifiant invalide" });
    }

    const [rows] = await db.query(
      `SELECT id, period_type, period_start, period_end, revenue, previous_revenue,
              bookings_count, avg_basket, top_services, viewed_at, created_at
       FROM finance_reports
       WHERE id = ? AND pro_id = ?`,
      [reportId, userId]
    );
    const report = (rows as any[])[0];
    if (!report) {
      return res.status(404).json({ success: false, error: "Rapport introuvable" });
    }

    if (!report.viewed_at) {
      await db.query("UPDATE finance_reports SET viewed_at = NOW() WHERE id = ?", [reportId]);
    }

    return res.json({
      success: true,
      data: {
        id: report.id,
        periodType: report.period_type,
        periodStart: report.period_start,
        periodEnd: report.period_end,
        revenue: Number(report.revenue) || 0,
        previousRevenue: Number(report.previous_revenue) || 0,
        bookingsCount: Number(report.bookings_count) || 0,
        avgBasket: Number(report.avg_basket) || 0,
        topServices: report.top_services ?? [],
        viewedAt: report.viewed_at ?? new Date().toISOString(),
        createdAt: report.created_at,
      },
    });
  } catch (error) {
    console.error(`[FINANCE_REPORT_DETAIL][${rid}] ERROR`, error);
    return res.status(500).json({ success: false, error: "Erreur lors du chargement du rapport" });
  }
});

// GET /api/pro/finance/performance - Analyses de performance
app.get("/api/pro/finance/performance", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;
  try {
    const userId = req.user.id;
    const guard = await requirePlan(userId, "signature");
    if (!guard.ok) return res.status(guard.status).json({ success: false, error: guard.error });

    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 90);
    const windowStartStr = windowStart.toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    // Meilleur jour de la semaine (CA total par jour, 90 derniers jours)
    const [dayRows] = await db.query(
      `SELECT EXTRACT(DOW FROM start_datetime)::int AS dow, SUM(price) AS revenue
       FROM reservations
       WHERE pro_id = ? AND start_datetime::date BETWEEN ? AND ?
         AND status IN ('confirmed','completed')
       GROUP BY dow
       ORDER BY revenue DESC
       LIMIT 1`,
      [userId, windowStartStr, todayStr]
    );
    const DOW_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const bestDayRow = (dayRows as any[])[0];
    const bestDay = bestDayRow ? DOW_LABELS[Number(bestDayRow.dow)] : null;

    // Meilleur créneau horaire (nb de rdv par heure, 90 derniers jours)
    const [hourRows] = await db.query(
      `SELECT EXTRACT(HOUR FROM start_datetime)::int AS hour, COUNT(*) AS count
       FROM reservations
       WHERE pro_id = ? AND start_datetime::date BETWEEN ? AND ?
         AND status IN ('confirmed','completed')
       GROUP BY hour
       ORDER BY count DESC
       LIMIT 1`,
      [userId, windowStartStr, todayStr]
    );
    const bestHourRow = (hourRows as any[])[0];
    const bestHour = bestHourRow ? `${String(bestHourRow.hour).padStart(2, "0")}h` : null;

    // Panier moyen + nb rdv (90 derniers jours)
    const { revenue: windowRevenue, count: windowCount } = await getRevenueStats(db, userId, windowStartStr, todayStr);
    const avgBasket = windowCount > 0 ? Math.round((windowRevenue / windowCount) * 100) / 100 : 0;

    // Taux de remplissage (créneaux réservés / créneaux ouverts, 90 derniers jours)
    const [[fillRow]]: any = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('available', 'booked')) AS total,
         COUNT(*) FILTER (WHERE status = 'booked') AS booked
       FROM slots
       WHERE pro_id = ? AND start_datetime::date BETWEEN ? AND ?`,
      [userId, windowStartStr, todayStr]
    );
    const totalSlots = Number(fillRow?.total) || 0;
    const bookedSlots = Number(fillRow?.booked) || 0;
    const fillRate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

    // Nouvelles vs clientes fidèles — parmi les clientes vues sur la
    // fenêtre, celles qui ont plus d'une résa au total (toutes périodes)
    // avec cette pro sont "fidèles", les autres "nouvelles".
    const [loyaltyRows] = await db.query(
      `SELECT r.client_id, COUNT(*) OVER (PARTITION BY r.client_id) AS lifetime_count
       FROM reservations r
       WHERE r.pro_id = ? AND r.status IN ('confirmed','completed')
         AND r.client_id IN (
           SELECT DISTINCT client_id FROM reservations
           WHERE pro_id = ? AND start_datetime::date BETWEEN ? AND ?
             AND status IN ('confirmed','completed')
         )`,
      [userId, userId, windowStartStr, todayStr]
    );
    const byClient = new Map<number, number>();
    for (const row of loyaltyRows as any[]) {
      byClient.set(row.client_id, Number(row.lifetime_count));
    }
    let newClients = 0;
    let returningClients = 0;
    for (const count of byClient.values()) {
      if (count > 1) returningClients++;
      else newClients++;
    }

    // Évolution du CA sur les 6 derniers mois (mois en cours inclus)
    const monthlyEvolution: Array<{ month: string; revenue: number }> = [];
    const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEndDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      const monthEnd = i === 0 ? todayStr : monthEndDate.toISOString().split("T")[0];
      const { revenue } = await getRevenueStats(db, userId, monthStart, monthEnd);
      monthlyEvolution.push({ month: MONTH_LABELS[monthDate.getMonth()], revenue });
    }

    return res.json({
      success: true,
      data: {
        bestDay,
        bestHour,
        avgBasket,
        fillRate,
        newClients,
        returningClients,
        monthlyEvolution,
      },
    });
  } catch (error) {
    console.error(`[FINANCE_PERFORMANCE][${rid}] ERROR`, error);
    return res.status(500).json({ success: false, error: "Erreur lors du chargement des analyses" });
  }
});


// GET /api/pro/finance/export - Export Excel
app.get("/api/pro/finance/export", authenticateToken, async (req: any, res) => {
  const rid = req.requestId;

  try {
    const userId = req.user.id;
    const period = req.query.period || "month"; // week | month | year

    // Export CSV/Excel = Sérénité ou supérieur
    const guard = await requirePlan(userId, "serenite");
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
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
const uploadDir = path.join(UPLOADS_DIR, "profile_photo");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* UPLOAD BANNER - DOSSIER */
const uploadBannerDir = path.join(UPLOADS_DIR, "banners");
if (!fs.existsSync(uploadBannerDir)) {
  fs.mkdirSync(uploadBannerDir, { recursive: true });
}


/* STORAGE — memory (sharp processes before disk write) */
const memStorage = multer.memoryStorage();


const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT  = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG or WebP image files are allowed"));
  }
};

const upload = multer({ storage: memStorage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });
const uploadBanner = multer({ storage: memStorage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

/* UPLOAD PROFILE PHOTO */
app.post(
  "/api/users/upload-photo",
  authMiddleware,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file || !req.user?.id) {
        return res.status(400).json({ success: false, message: "No file or userId provided" });
      }

      const filename = `pp_${req.user.id}_${Date.now()}.webp`;
      const destPath = path.join(uploadDir, filename);

      await sharp(req.file.buffer)
        .resize(512, 512, { fit: "cover", position: "center" })
        .webp({ quality: 82 })
        .toFile(destPath);

      const photoPath = `/uploads/profile_photo/${filename}`;
      await db.execute("UPDATE users SET profile_photo = ? WHERE id = ?", [photoPath, req.user.id]);

      res.json({ success: true, photo: photoPath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  }
);

/* DELETE PROFILE PHOTO */
app.delete(
  "/api/users/profile-photo",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.execute("UPDATE users SET profile_photo = NULL WHERE id = ?", [req.user!.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Erreur lors de la suppression" });
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
      if (!userId) return res.status(401).json({ success: false, message: "Non authentifié" });
      if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier fourni" });

      const filename = `banner_${userId}_${Date.now()}.webp`;
      const destPath = path.join(uploadBannerDir, filename);

      await sharp(req.file.buffer)
        .resize(1200, 400, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(destPath);

      const fileUrl = `/uploads/banners/${filename}`;
      await db.query("UPDATE users SET banner_photo = ? WHERE id = ?", [fileUrl, userId]);

      const [users] = await db.query(
        "SELECT id, email, first_name, last_name, role, city, profile_photo, banner_photo, bio, instagram_account, activity_name FROM users WHERE id = ?",
        [userId]
      ) as any;

      res.json({ success: true, message: "Bannière mise à jour", data: users[0] });
    } catch (error) {
      console.error("Error uploading banner:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'upload" });
    }
  }
);

/* ── PORTFOLIO GALLERY (public-profile "réalisations") ──────────────────── */
const uploadGalleryDir = path.join(UPLOADS_DIR, "gallery");
if (!fs.existsSync(uploadGalleryDir)) {
  fs.mkdirSync(uploadGalleryDir, { recursive: true });
}
const uploadGallery = multer({ storage: memStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const MAX_GALLERY_IMAGES = 10;

/* GET /api/pro/gallery */
app.get(
  "/api/pro/gallery",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = getProId(req);
      const [rows] = await db.query(
        "SELECT id, url, thumbnail, created_at FROM gallery_images WHERE pro_id = ? ORDER BY created_at DESC",
        [proId]
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error("Error fetching gallery:", error);
      res.status(500).json({ success: false, message: "Erreur lors du chargement de la galerie" });
    }
  }
);

/* POST /api/pro/gallery */
app.post(
  "/api/pro/gallery",
  authMiddleware,
  uploadGallery.single("image"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = getProId(req);

      // Portfolio photos = Sérénité ou supérieur
      const guard = await requirePlan(proId, "serenite");
      if (!guard.ok) {
        return res.status(guard.status).json({ success: false, message: guard.error });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: "Aucun fichier fourni" });
      }

      const [[{ count }]]: any = await db.query(
        "SELECT COUNT(*) AS count FROM gallery_images WHERE pro_id = ?",
        [proId]
      );
      if (Number(count) >= MAX_GALLERY_IMAGES) {
        return res.status(400).json({ success: false, message: `Maximum ${MAX_GALLERY_IMAGES} photos.` });
      }

      const base = `gallery_${proId}_${Date.now()}`;
      const fullFilename = `${base}.webp`;
      const thumbFilename = `${base}_thumb.webp`;

      await sharp(req.file.buffer)
        .resize(1080, 1080, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(path.join(uploadGalleryDir, fullFilename));

      await sharp(req.file.buffer)
        .resize(300, 300, { fit: "cover", position: "center" })
        .webp({ quality: 75 })
        .toFile(path.join(uploadGalleryDir, thumbFilename));

      const url = `/uploads/gallery/${fullFilename}`;
      const thumbnail = `/uploads/gallery/${thumbFilename}`;

      const [rows] = await db.query(
        `INSERT INTO gallery_images (pro_id, url, thumbnail) VALUES (?, ?, ?) RETURNING id, url, thumbnail, created_at`,
        [proId, url, thumbnail]
      );

      res.json({ success: true, data: (rows as any[])[0] });
    } catch (error) {
      console.error("Error uploading gallery photo:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'upload" });
    }
  }
);

/* DELETE /api/pro/gallery/:id */
app.delete(
  "/api/pro/gallery/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = getProId(req);
      const imageId = parseParamToInt(req.params.id);
      if (imageId === null) {
        return res.status(400).json({ success: false, message: "Identifiant invalide" });
      }

      const [rows] = await db.query(
        "SELECT url, thumbnail FROM gallery_images WHERE id = ? AND pro_id = ?",
        [imageId, proId]
      );
      const image = (rows as any[])[0];
      if (!image) {
        return res.status(404).json({ success: false, message: "Photo introuvable" });
      }

      await db.execute("DELETE FROM gallery_images WHERE id = ? AND pro_id = ?", [imageId, proId]);

      for (const relPath of [image.url, image.thumbnail]) {
        const filePath = path.join(UPLOADS_DIR, relPath.replace(/^\/uploads\//, ""));
        fs.unlink(filePath, () => {}); // best-effort — la ligne DB est déjà supprimée
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting gallery photo:", error);
      res.status(500).json({ success: false, message: "Erreur lors de la suppression" });
    }
  }
);

/* ── PUSH NOTIFICATIONS ─────────────────────────────────────────────────── */

/* GET VAPID PUBLIC KEY */
app.get("/api/push/vapid-key", (_req: Request, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ success: false, message: "Push not configured" });
  res.json({ publicKey: key });
});

/* SAVE PUSH SUBSCRIPTION */
app.post(
  "/api/push/subscribe",
  pushLimiter,
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { endpoint, p256dh, auth } = req.body;
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ success: false, message: "Subscription data missing" });
      }
      await db.execute(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [req.user!.id, endpoint, p256dh, auth]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Subscribe failed" });
    }
  }
);

/* REMOVE PUSH SUBSCRIPTION */
app.delete(
  "/api/push/unsubscribe",
  pushLimiter,
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ success: false, message: "Endpoint required" });
      await db.execute(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        [req.user!.id, endpoint]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Unsubscribe failed" });
    }
  }
);

/* SAVE EXPO PUSH TOKEN (mobile app) */
app.post(
  "/api/notifications/push-token",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.body as { token?: string };
      if (!token || typeof token !== "string") {
        return res.status(400).json({ success: false, message: "Token required" });
      }
      await db.execute(
        `INSERT INTO expo_push_tokens (user_id, token)
         VALUES (?, ?)
         ON CONFLICT (user_id, token) DO NOTHING`,
        [req.user!.id, token]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Failed to save push token" });
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
        acceptance_conditions,
        currentPassword,
        newPassword,
        geo_precision,
        address_line,
        postal_code,
        service_radius_km,
        service_area_label,
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
      const updatedAcceptanceConditions =
        user.role === "pro"
          ? acceptance_conditions !== undefined
            ? JSON.stringify(acceptance_conditions)
            : (user as any).acceptance_conditions
              ? JSON.stringify((user as any).acceptance_conditions)
              : null
          : null;

      // Address privacy: geo_precision is the visibility toggle — 'city' (default, safe)
      // keeps the exact address private and only exposes an approximate public point;
      // 'address' is an explicit pro opt-in to publish the exact address + a precise pin.
      const updatedGeoPrecision =
        user.role === "pro"
          ? geo_precision !== undefined
            ? geo_precision
            : (user.geo_precision ?? "city")
          : null;
      const updatedAddressLine =
        user.role === "pro"
          ? address_line !== undefined ? address_line : user.address_line ?? null
          : null;
      const updatedPostalCode =
        user.role === "pro"
          ? postal_code !== undefined ? postal_code : user.postal_code ?? null
          : null;
      const updatedServiceRadiusKm =
        user.role === "pro"
          ? service_radius_km !== undefined ? service_radius_km : user.service_radius_km ?? 5
          : null;
      const updatedServiceAreaLabel =
        user.role === "pro"
          ? service_area_label !== undefined ? service_area_label : user.service_area_label ?? null
          : null;

      if (
        user.role === "pro" &&
        updatedGeoPrecision === "address" &&
        (!updatedAddressLine || !updatedPostalCode || !updatedCity)
      ) {
        return res.status(400).json({
          success: false,
          message: "Adresse, code postal et ville requis pour publier votre adresse exacte",
        });
      }

      // Geocode when the city or the exact address changes for pro profiles (non-blocking)
      let geoLat: number | null = (user as any).latitude ?? null;
      let geoLng: number | null = (user as any).longitude ?? null;
      if (user.role === "pro") {
        const cityChanged = updatedCity && updatedCity !== user.city;
        const addressChanged =
          updatedGeoPrecision === "address" &&
          (updatedAddressLine !== user.address_line ||
            updatedPostalCode !== user.postal_code ||
            cityChanged);

        if (addressChanged) {
          const fullAddress = `${updatedAddressLine}, ${updatedPostalCode} ${updatedCity}`;
          const coords = await geocodeCity(fullAddress);
          if (coords) { geoLat = coords.lat; geoLng = coords.lng; }
        } else if (cityChanged) {
          const coords = await geocodeCity(updatedCity);
          if (coords) { geoLat = coords.lat; geoLng = coords.lng; }
        }
      }

      // The public point is always a bounded, deterministic jitter of the real coordinates —
      // never the exact coordinates themselves — so it's ready the instant a pro switches
      // back to 'city' visibility, and it stays stable across requests either way.
      let publicLat: number | null = null;
      let publicLng: number | null = null;
      if (user.role === "pro" && geoLat != null && geoLng != null) {
        const jittered = jitterCoords(geoLat, geoLng, req.user!.id);
        publicLat = jittered.lat;
        publicLng = jittered.lng;
      }

      await db.execute(
        `UPDATE users
         SET first_name = ?, last_name = ?, activity_name = ?, city = ?, instagram_account = ?, bio = ?, acceptance_conditions = ?::jsonb, password_hash = ?, latitude = ?, longitude = ?,
             geo_precision = ?, address_line = ?, postal_code = ?, public_latitude = ?, public_longitude = ?, service_radius_km = ?, service_area_label = ?
         WHERE id = ?`,
        [
          updatedFirstName,
          updatedLastName,
          updatedActivityName,
          updatedCity,
          updatedInstagramAccount,
          updatedBio,
          updatedAcceptanceConditions,
          passwordHash,
          geoLat,
          geoLng,
          updatedGeoPrecision,
          updatedAddressLine,
          updatedPostalCode,
          publicLat,
          publicLng,
          updatedServiceRadiusKm,
          updatedServiceAreaLabel,
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


/* UPDATE PAYMENTS
 * Bascule accept_online_payment. Les coordonnées bancaires réelles (IBAN)
 * sont désormais entièrement gérées par Stripe Connect lors de l'onboarding
 * (voir /api/pro/stripe/*) — ce champ IBAN self-service a été retiré côté
 * app et n'est plus lu/écrit ici pour éviter la double saisie.
 */
app.put(
  "/api/users/payments",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { accept_online_payment } = req.body as UpdatePaymentsBody;

      await db.execute(
        `UPDATE users SET accept_online_payment = ? WHERE id = ?`,
        [Boolean(accept_online_payment), userId]
      );

      res.json({
        success: true,
        data: { accept_online_payment: Boolean(accept_online_payment) },
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
  express.static(UPLOADS_DIR, {
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
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const search = ((req.query.search as string) || "").trim();
      const cityFilter = ((req.query.city as string) || "").trim();
      const serviceFilter = ((req.query.service as string) || "").trim();
      const minRating = parseFloat(req.query.min_rating as string) || 0;

      // Geolocation params
      const userLat = parseFloat(req.query.lat as string);
      const userLng = parseFloat(req.query.lng as string);
      const hasGeo = !isNaN(userLat) && !isNaN(userLng);
      const maxKm = parseFloat(req.query.radius as string) || 50;

      const whereParts: string[] = ["u.role = 'pro'", "u.pro_status = 'active'", "u.is_active = TRUE"];
      const whereParams: any[] = [];

      if (search) {
        whereParts.push("(u.activity_name ILIKE ? OR u.first_name ILIKE ? OR u.last_name ILIKE ? OR u.city ILIKE ? OR u.specialty ILIKE ?)");
        whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (cityFilter) {
        whereParts.push("u.city ILIKE ?");
        whereParams.push(`%${cityFilter}%`);
      }
      if (serviceFilter) {
        whereParts.push("EXISTS (SELECT 1 FROM prestations p2 WHERE p2.pro_id = u.id AND p2.name ILIKE ? AND p2.active = TRUE)");
        whereParams.push(`%${serviceFilter}%`);
      }

      const whereClause = whereParts.join(" AND ");
      const havingClause = minRating > 0 ? "HAVING COALESCE(AVG(r.rating), 0) >= ?" : "";
      const havingParams = minRating > 0 ? [minRating] : [];

      connection = await db.getConnection();

      const [countRows] = await connection.query(
        `SELECT COUNT(*) as total FROM (
          SELECT u.id FROM users u
          LEFT JOIN reviews r ON r.pro_id = u.id
          WHERE ${whereClause}
          GROUP BY u.id
          ${havingClause}
        ) as c`,
        [...whereParams, ...havingParams]
      );
      const total = Number((countRows as any[])[0]?.total ?? 0);

      const [rows] = await connection.query(
        `SELECT
          u.id, u.first_name, u.last_name, u.activity_name, u.city,
          u.instagram_account, u.profile_photo, u.banner_photo, u.bio, u.pro_status,
          u.latitude, u.longitude, u.public_latitude, u.public_longitude,
          u.service_radius_km, u.service_area_label, u.specialty, u.geo_precision,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(DISTINCT r.id) as reviews_count
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        WHERE ${whereClause}
        GROUP BY u.id
        ${havingClause}
        ORDER BY avg_rating DESC, reviews_count DESC
        LIMIT ? OFFSET ?`,
        [...whereParams, ...havingParams, limit, offset]
      );

      // Distance is always computed from the real coordinates (never the public/jittered
      // ones) so proximity search stays accurate regardless of a pro's privacy choice.
      // The coordinates actually returned to the client are swapped to the approximate
      // public point below, whenever the pro hasn't opted in to publish her exact address.
      let pros = (rows as any[]).map((p) => {
        const addressVisible = p.geo_precision === "address";
        const exactLat = p.latitude != null ? Number(p.latitude) : null;
        const exactLng = p.longitude != null ? Number(p.longitude) : null;

        let distance_km: number | null = null;
        if (hasGeo && exactLat != null && exactLng != null) {
          distance_km = Math.round(haversineKm(userLat, userLng, exactLat, exactLng) * 10) / 10;
        }

        const { public_latitude, public_longitude, geo_precision, latitude, longitude, ...rest } = p;
        return {
          ...rest,
          latitude: addressVisible ? exactLat : (public_latitude != null ? Number(public_latitude) : null),
          longitude: addressVisible ? exactLng : (public_longitude != null ? Number(public_longitude) : null),
          address_visible: addressVisible,
          distance_km,
        };
      });

      if (hasGeo) {
        // Filter by radius (only when geo is requested)
        if (req.query.nearby === "1") {
          pros = pros.filter((p) => p.distance_km === null || p.distance_km <= maxKm);
        }
        // Sort by distance when geo is active
        pros.sort((a, b) => {
          if (a.distance_km === null && b.distance_km === null) return 0;
          if (a.distance_km === null) return 1;
          if (b.distance_km === null) return -1;
          return a.distance_km - b.distance_km;
        });
      }

      res.json({
        success: true,
        data: pros,
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
        log.warn("/api/reviews/pro/:proId", `ID invalide reçu: ${req.params.proId}`);
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

/* CREATE SUBSCRIPTION — DEV ONLY
 * Cette route ne doit JAMAIS être accessible en production (voir le guard
 * NODE_ENV ci-dessous).
 * pro_status = 'active' peut aussi être positionné par : le webhook
 * RevenueCat (chemin normal), POST /api/admin/users/:id/grant-subscription
 * (don admin, expiré par cron/subscription-expiry.ts), et
 * POST /api/pro/subscription/sync (rattrapage si le webhook est en retard).
 */
app.post(
  "/api/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    if (process.env.NODE_ENV !== "development") {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== process.env.DEV_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    let connection;
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Utilisateur non authentifié" });
      }

      const { plan, billingType, monthlyPrice, totalPrice, commitmentMonths, startDate, endDate, status, paymentId } = req.body;
      if (!plan || !billingType || !monthlyPrice) {
        return res.status(400).json({ success: false, message: "Champs requis manquants" });
      }

      const effectiveStartDate = startDate ?? new Date().toISOString().split("T")[0];
      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        await connection.execute(
          `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
          [userId]
        );

        const [subRows] = await connection.execute(
          `INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [userId, plan, billingType, monthlyPrice, totalPrice ?? null, commitmentMonths ?? null, effectiveStartDate, endDate ?? null, status || "active", paymentId ?? null]
        );

        if (status === "active" || !status) {
          await connection.execute(`UPDATE users SET pro_status = 'active' WHERE id = ?`, [userId]);
        }

        await connection.commit();
        const subscriptionId = (subRows as any[])[0]?.id;
        res.status(201).json({ success: true, data: { id: subscriptionId, subscriptionId, status: status || "active" }, message: "Abonnement créé (DEV ONLY)" });
      } catch (err) {
        await connection.rollback();
        throw err;
      }
    } catch (error) {
      console.error("Erreur création abonnement (dev):", error);
      res.status(500).json({ success: false, message: "Erreur lors de la création de l'abonnement" });
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
    try {
      const proId = getProId(req);

      // 7 requêtes indépendantes exécutées en parallèle (Promise.all)
      // → latence totale = max(latences individuelles) au lieu de leur somme
      const [
        [weekStatsRows],
        [todayRows],
        [upcomingRows],
        [slotStatsRows],
        [clientsWeekRows],
        [topServicesRows],
        [indexedRevenueRows],
      ] = await Promise.all([
        // 1. Stats semaine actuelle + semaine passée (fusionnées en 1 requête)
        db.query(
          `SELECT
            COUNT(*) FILTER (WHERE DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE)) AS this_week,
            COUNT(*) FILTER (WHERE DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days') AS last_week
          FROM reservations
          WHERE pro_id = ?
            AND status IN ('confirmed', 'completed')
            AND start_datetime >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'`,
          [proId]
        ),
        // 2. Prévision du jour (montant + nombre de RDV — distinct des
        // "prochaines clientes" qui, elles, regardent au-delà d'aujourd'hui)
        db.query(
          `SELECT COALESCE(SUM(price), 0) AS total, COUNT(*) AS count
          FROM reservations
          WHERE pro_id = ?
            AND status IN ('confirmed', 'completed')
            AND start_datetime::date = CURRENT_DATE`,
          [proId]
        ),
        // 3. Prochaines clientes
        db.query(
          `SELECT
            r.id,
            r.client_id AS client_user_id,
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
          LIMIT 3`,
          [proId]
        ),
        // 4. Taux de remplissage (total + booked fusionnés en 1 requête)
        db.query(
          `SELECT
            COUNT(*) FILTER (WHERE status IN ('available', 'booked')) AS total_slots,
            COUNT(*) FILTER (WHERE status = 'booked') AS booked_slots
          FROM slots
          WHERE pro_id = ?
            AND start_datetime >= CURRENT_DATE
            AND start_datetime < CURRENT_DATE + INTERVAL '7 days'`,
          [proId]
        ),
        // 5. Clientes de la semaine
        db.query(
          `SELECT COUNT(DISTINCT client_id) AS count
          FROM reservations
          WHERE pro_id = ?
            AND status IN ('confirmed', 'completed')
            AND DATE_TRUNC('week', start_datetime) = DATE_TRUNC('week', CURRENT_DATE)`,
          [proId]
        ),
        // 6. Top prestations (30j)
        db.query(
          `SELECT
            p.name AS prestation_name,
            COUNT(*) AS count
          FROM reservations r
          JOIN prestations p ON p.id = r.prestation_id
          WHERE r.pro_id = ?
            AND r.status IN ('confirmed', 'completed')
            AND r.start_datetime >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY p.id, p.name
          ORDER BY count DESC
          LIMIT 5`,
          [proId]
        ),
        // 7. Revenus hebdomadaires — le dimanche est exclu explicitement
        // (jamais bookable via l'app) plutôt que de compter sur l'absence
        // de données : une réservation insérée manuellement un dimanche ne
        // doit jamais apparaître dans ce graphe.
        db.query(
          `SELECT
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
              AND EXTRACT(DOW FROM start_datetime) != 0
            GROUP BY start_datetime::date
          ) AS t
          ORDER BY jour`,
          [proId]
        ),
      ]) as [any, any, any, any, any, any, any];

      // ── Calcul weeklyStats ──────────────────────────────────────────────────
      const servicesThisWeek = Number(weekStatsRows[0]?.this_week ?? 0);
      const servicesLastWeek = Number(weekStatsRows[0]?.last_week ?? 0);
      let change = 0;
      let isUp = true;
      if (servicesLastWeek > 0) {
        change = Math.round(((servicesThisWeek - servicesLastWeek) / servicesLastWeek) * 100);
        isUp = change >= 0;
        change = Math.abs(change);
      }

      // ── Prévision du jour ───────────────────────────────────────────────────
      const todayForecast = Number(todayRows[0]?.total ?? 0);
      const todayAppointmentsCount = Number(todayRows[0]?.count ?? 0);

      // ── Prochaines clientes ─────────────────────────────────────────────────
      const upcomingClients = upcomingRows.map((row: any) => {
        const initials = row.client_name
          .split(" ")
          .filter(Boolean)
          .map((part: string) => part[0]?.toUpperCase())
          .join("")
          .slice(0, 2);
        const status = row.status === "completed" ? "completed" : "upcoming";
        return {
          id: row.id,
          client_user_id: row.client_user_id,
          name: row.client_name,
          service: row.prestation_name,
          time: row.start_time,
          price: Number(row.price),
          status,
          avatar: initials,
        };
      });

      // ── Taux de remplissage ─────────────────────────────────────────────────
      const totalSlots = Number(slotStatsRows[0]?.total_slots ?? 0);
      const bookedSlots = Number(slotStatsRows[0]?.booked_slots ?? 0);
      const fillRate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

      // ── Clientes de la semaine ──────────────────────────────────────────────
      const clientsThisWeek = Number(clientsWeekRows[0]?.count ?? 0);

      // ── Top services ────────────────────────────────────────────────────────
      const totalTopCount = topServicesRows.reduce((acc: number, row: any) => acc + Number(row.count), 0);
      const topServices = topServicesRows.map((row: any) => ({
        name: row.prestation_name,
        percentage: totalTopCount > 0 ? Math.round((Number(row.count) / totalTopCount) * 100) : 0,
      }));

      // ── Revenus hebdomadaires ───────────────────────────────────────────────
      const DOW_LABELS: Record<number, string> = { 2: "Lun", 3: "Mar", 4: "Mer", 5: "Jeu", 6: "Ven", 7: "Sam", 1: "Dim" };
      const weeklyRevenue = indexedRevenueRows.map((row: any) => ({
        day: DOW_LABELS[row.dayOfWeek] ?? "?",
        amount: Number(row.total ?? 0),
      }));

      res.json({
        weeklyStats: { services: servicesThisWeek, change, isUp },
        todayForecast,
        todayAppointmentsCount,
        upcomingClients,
        fillRate,
        clientsThisWeek,
        topServices,
        weeklyRevenue,
      });
    } catch (err: any) {
      console.error(err);
      if (err.message === "Pro non authentifié") {
        return res.status(401).json({ message: "Non authentifié" });
      }
      res.status(500).json({ message: "Erreur serveur" });
    }
  }
);

/* PRO RESERVATIONS SEARCH — by client name or prestation, across all time
 * (past + future), unlike /api/pro/calendar which is always date-bounded to
 * whatever month the UI has loaded. */
app.get(
  "/api/pro/reservations/search",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.json({ success: true, data: [] });

      connection = await db.getConnection();

      const like = `%${q}%`;
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
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed','completed')
          AND (CONCAT(u.first_name, ' ', u.last_name) ILIKE ? OR p.name ILIKE ?)
        ORDER BY r.start_datetime DESC
        LIMIT 100
        `,
        [proId, like, like]
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
      console.error("[RESERVATIONS SEARCH] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
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
        // r.last_visit peut être un rendez-vous "confirmed" à venir (pas encore
        // eu lieu) : borner à 0 pour éviter un décompte négatif ("il y a -57 jours").
        const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

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

      // This legacy route had no ownership check at all — any authenticated
      // pro could overwrite notes on a client_id they'd never worked with,
      // just by guessing/enumerating IDs. Same relationship check as the
      // newer PATCH endpoint on this same path (routes/nail-tech.routes.ts).
      const [relRows] = await connection.query(
        `SELECT id FROM reservations WHERE pro_id = ? AND client_id = ? LIMIT 1`,
        [proId, clientId]
      );
      if ((relRows as any[]).length === 0) {
        return res.status(403).json({ success: false, message: "Aucun rendez-vous avec cette cliente." });
      }

      await connection.query(
        `
        INSERT INTO pro_client_notes (pro_id, client_id, notes)
        VALUES (?, ?, ?)
        ON CONFLICT (pro_id, client_id) DO UPDATE SET notes = EXCLUDED.notes
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
      // Consistent with the RevenueCat webhook's own CANCELLATION handling —
      // access ends immediately rather than leaving pro_status stale until
      // a later webhook event happens to correct it.
      await connection.query(
        `UPDATE users SET pro_status = 'inactive' WHERE id = ?`,
        [proId]
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

/* SYNC PRO SUBSCRIPTION — reconciles DB with RevenueCat's live entitlement
   state right after a client-reported purchase/restore. The webhook remains
   the primary source of truth; this is a fallback for when it's delayed or
   missed, so the pro isn't stuck looking "active" on their device while the
   backend still has them gated out. Never trusts client-supplied plan/price —
   the plan comes exclusively from RevenueCat's own API. Activation-only: if
   RevenueCat reports no active entitlement, this leaves DB state untouched
   (deactivation stays the webhook's responsibility). */
app.post(
  "/api/pro/subscription/sync",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      const active = await getActiveEntitlement(proId);
      if (!active) {
        return res.json({ success: true, data: { reconciled: false } });
      }

      connection = await db.getConnection();

      const [currentRows] = (await connection.query(
        `SELECT plan FROM subscriptions WHERE client_id = ? AND status = 'active' LIMIT 1`,
        [proId]
      )) as any[];
      const currentPlan = currentRows[0]?.plan ?? null;

      if (currentPlan === active.plan) {
        // DB already reflects RevenueCat's state (the webhook already landed).
        return res.json({ success: true, data: { reconciled: false, plan: active.plan } });
      }

      const endDate = active.expiresAtMs ? new Date(active.expiresAtMs).toISOString().slice(0, 10) : null;

      await connection.beginTransaction();
      try {
        await connection.execute(
          `UPDATE subscriptions SET status = 'cancelled' WHERE client_id = ? AND status = 'active'`,
          [proId]
        );
        await connection.execute(
          `INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
           VALUES (?, ?, 'monthly', 0, NULL, NULL, CURRENT_DATE, ?, 'active', 'rc_sync')`,
          [proId, active.plan, endDate]
        );
        await connection.execute(`UPDATE users SET pro_status = 'active' WHERE id = ?`, [proId]);
        await connection.commit();
      } catch (txErr) {
        await connection.rollback().catch(() => {});
        throw txErr;
      }

      log.info("/api/pro/subscription/sync", 200, 0, proId);
      return res.json({ success: true, data: { reconciled: true, plan: active.plan } });
    } catch (err) {
      log.error(
        "/api/pro/subscription/sync",
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err.stack : undefined
      );
      return res.status(500).json({ success: false, message: "Erreur de synchronisation" });
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
        await connection.query(
          `INSERT INTO client_notification_settings (user_id, reminders, changes, messages, late, offers, email_summary)
           VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
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
        await connection.query(
          `INSERT INTO pro_notification_settings (user_id, new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary)
           VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
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
      const dur = Math.abs(parseInt(String(duration), 10)) || 60;

      connection = await db.getConnection();

      await connection.query(
        `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status, created_at)
         VALUES (?, ?::timestamptz, ?::timestamptz + (? * INTERVAL '1 minute'), ?, 'available', NOW())`,
        [proId, startDatetime, startDatetime, dur, dur]
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
            WHEN start_datetime + (ABS(duration) * INTERVAL '1 minute') < NOW() THEN 'past'
            ELSE status
          END AS computed_status,
          status AS original_status,
          CASE
            WHEN start_datetime + (ABS(duration) * INTERVAL '1 minute') < NOW() THEN 0
            WHEN status = 'available' THEN 1
            ELSE 0
          END AS is_active,
          CASE
            WHEN start_datetime + (ABS(duration) * INTERVAL '1 minute') < NOW() THEN 0
            WHEN status = 'available' THEN 1
            WHEN status = 'booked' THEN 0
            ELSE 1
          END AS is_available
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
      const { status, date, time, duration } = req.body;

      connection = await db.getConnection();

      // Vérifier que le créneau existe, appartient au pro, et n'est pas passé
      const [slotRows] = await connection.query(
        `SELECT id FROM slots WHERE id = ? AND pro_id = ? AND start_datetime + (ABS(duration) * INTERVAL '1 minute') > NOW()`,
        [slotId, proId]
      );
      if ((slotRows as any[]).length === 0) {
        return res.status(400).json({ success: false, error: "Ce créneau est passé ou n'existe pas" });
      }

      if (time && date) {
        // Modification de l'heure/durée
        const dur = Math.abs(parseInt(String(duration), 10)) || 60;
        const newStart = `${date} ${time}:00`;
        await connection.query(
          `UPDATE slots
           SET start_datetime = ?::timestamptz,
               end_datetime   = ?::timestamptz + (? * INTERVAL '1 minute'),
               duration       = ?
           WHERE id = ? AND pro_id = ?`,
          [newStart, newStart, dur, dur, slotId, proId]
        );
      } else if (status && ['available', 'blocked'].includes(status)) {
        // Modification du statut uniquement
        await connection.query(
          `UPDATE slots SET status = ? WHERE id = ? AND pro_id = ?`,
          [status, slotId, proId]
        );
      } else {
        return res.status(400).json({ success: false, error: "Paramètres invalides" });
      }

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

      // Refuser la suppression d'un créneau réservé
      const [slotCheck] = await connection.query(
        `SELECT status FROM slots WHERE id = ? AND pro_id = ?`,
        [slotId, proId]
      );
      if ((slotCheck as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Créneau introuvable" });
      }
      if ((slotCheck as any[])[0].status === 'booked') {
        return res.status(400).json({ success: false, error: "Impossible de supprimer un créneau réservé" });
      }

      await connection.query(
        `DELETE FROM slots WHERE id = ? AND pro_id = ?`,
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
// PRO - UPDATE RESERVATION STATUS
// ==========================================

/* PATCH /api/pro/reservations/:id/status — mark completed or cancelled */
app.patch(
  "/api/pro/reservations/:id/status",
  authMiddleware,
  validate(reservationStatusSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const reservationId = parseInt(String(req.params.id));
      const { status } = req.body;

      connection = await db.getConnection();

      const [rows] = await connection.query(
        "SELECT id, status, slot_id, client_id, pro_id, payment_status, start_datetime FROM reservations WHERE id = ? AND pro_id = ?",
        [reservationId, proId]
      );

      if ((rows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Réservation non trouvée" });
      }

      const reservation = (rows as any[])[0];

      if (reservation.status === "cancelled" || reservation.status === "completed") {
        return res.status(400).json({ success: false, error: "Réservation déjà finalisée" });
      }

      if (status === "cancelled") {
        await connection.query(
          "UPDATE reservations SET status = 'cancelled', cancelled_by = 'pro' WHERE id = ?",
          [reservationId]
        );

        // Free the slot
        if (reservation.slot_id) {
          await connection.query(
            "UPDATE slots SET status = 'available' WHERE id = ?",
            [reservation.slot_id]
          );
        }

        // Initiate refund if client had paid online (best-effort — outside connection to avoid lock)
        connection.release();
        connection = undefined;

        if (
          reservation.payment_status === "deposit_paid" ||
          reservation.payment_status === "fully_paid"
        ) {
          try {
            const refundResult = await initiateRefundsForReservation(reservationId);
            if (refundResult.refunded) {
              log.warn("/api/pro/reservations/:id/status", "Refund initiated after pro cancellation", {
                reservationId,
                totalRefunded: refundResult.totalRefunded,
              });
            }
          } catch (refundErr) {
            log.error("/api/pro/reservations/:id/status", "Refund initiation failed (non-fatal)", refundErr instanceof Error ? refundErr.stack : String(refundErr));
          }
        }

        // Notify client of pro cancellation (best-effort)
        try {
          const startAt = reservation.start_datetime instanceof Date
            ? reservation.start_datetime
            : new Date(reservation.start_datetime);
          const cancelTitle = "RDV annulé par le pro";
          const cancelMessage = `Ton rendez-vous du ${formatRdvWhen(startAt)} a été annulé par le pro.`;
          const [notifRows] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'booking_cancelled', ?, ?, ?)
             RETURNING id, created_at`,
            [reservation.client_id, cancelTitle, cancelMessage, JSON.stringify({ reservation_id: reservationId })]
          );
          const notif = (notifRows as any[])[0];
          if (notif) {
            await sendNotificationToUser(reservation.client_id, {
              id: notif.id,
              type: "booking_cancelled",
              title: cancelTitle,
              message: cancelMessage,
              data: { reservation_id: reservationId },
              created_at: notif.created_at,
            });
          }
        } catch (notifErr) {
          log.warn("/api/pro/reservations/:id/status", "client notification failed (non-fatal)", { reservationId });
        }

        // Notify waiting-list clients that a slot is now available (best-effort)
        const startAt2 = reservation.start_datetime instanceof Date
          ? reservation.start_datetime
          : new Date(reservation.start_datetime);
        notifyWaitingList(reservation.pro_id, startAt2).catch(() => {});

        pushLiveActivityMutation(reservationId, "end").catch(() => {});
      } else {
        // status === "completed"
        await connection.query(
          "UPDATE reservations SET status = ? WHERE id = ?",
          [status, reservationId]
        );

        pushLiveActivityMutation(reservationId, "end").catch(() => {});
      }

      res.json({ success: true, message: `Réservation ${status}` });
    } catch (err) {
      console.error("[PATCH reservation status] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// PRO UNAVAILABILITIES
// ==========================================

/* GET UNAVAILABILITIES */
app.get(
  "/api/pro/unavailabilities",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { from, to } = req.query;

      connection = await db.getConnection();

      let query = "SELECT id, pro_id, start_date, end_date, reason, created_at FROM unavailabilities WHERE pro_id = ?";
      const params: any[] = [proId];

      if (from) {
        query += " AND end_date >= ?";
        params.push(String(from));
      }
      if (to) {
        query += " AND start_date <= ?";
        params.push(String(to));
      }

      query += " ORDER BY start_date ASC";

      const [rows] = await connection.query(query, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET UNAVAILABILITIES] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* CREATE UNAVAILABILITY */
app.post(
  "/api/pro/unavailabilities",
  authMiddleware,
  validate(unavailabilitySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { start_date, end_date, reason } = req.body;

      connection = await db.getConnection();

      const [rows] = await connection.query(
        "INSERT INTO unavailabilities (pro_id, start_date, end_date, reason) VALUES (?, ?, ?, ?) RETURNING *",
        [proId, start_date, end_date, reason || null]
      );

      const row = Array.isArray(rows) ? rows[0] : rows;
      res.json({ success: true, data: row });
    } catch (err) {
      console.error("[CREATE UNAVAILABILITY] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* DELETE UNAVAILABILITY */
app.delete(
  "/api/pro/unavailabilities/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const id = parseInt(String(req.params.id));

      connection = await db.getConnection();

      const [result] = await connection.query(
        "DELETE FROM unavailabilities WHERE id = ? AND pro_id = ? RETURNING id",
        [id, proId]
      );

      if ((result as any[]).length === 0) {
        return res.status(404).json({ success: false, error: "Indisponibilité non trouvée" });
      }

      res.json({ success: true, message: "Indisponibilité supprimée" });
    } catch (err) {
      console.error("[DELETE UNAVAILABILITY] error =", err);
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

/**
 * ADD PAYMENT METHOD — Stripe SetupIntent flow, in two steps:
 *   1. POST .../setup-intent — server creates a SetupIntent, client confirms
 *      it directly with Stripe (card number/CVC never touch this backend).
 *   2. POST .../confirm — client hands back the resulting paymentMethodId;
 *      server fetches the card's brand/last4/expiry from Stripe and stores
 *      only that + the Stripe PaymentMethod ID (payment_methods.stripe_pm_id).
 *
 * This replaces a previous endpoint that stored the raw card number and
 * CVC directly in Postgres — a serious PCI-DSS violation (CVC in particular
 * must never be persisted past authorization, encrypted or not). That
 * endpoint also targeted `card_number`/`cvc` columns the schema doesn't
 * even have (see stripe_pm_id in the 20260227000001 migration, added when
 * this table was already switched to tokenized storage), so it was
 * throwing a 500 on every real call — and the client-side SetupIntent flow
 * it was supposed to be replaced by (lib/api.ts's createSetupIntent /
 * confirmSetup, already shipped in the mobile app) had no backend routes
 * at all until now.
 */
app.post(
  "/api/client/payment-methods/setup-intent",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Non authentifié" });

      const [userRows] = await db.query(
        `SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = ?`,
        [userId]
      );
      const user = (userRows as any[])[0];
      if (!user) return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

      let stripeCustomerId: string = user.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          metadata: { blyss_user_id: String(userId) },
        });
        stripeCustomerId = customer.id;
        await db.execute(`UPDATE users SET stripe_customer_id = ? WHERE id = ?`, [stripeCustomerId, userId]);
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
      });

      res.json({ success: true, data: { clientSecret: setupIntent.client_secret } });
    } catch (error) {
      console.error("Erreur setup-intent:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'initialisation" });
    }
  }
);

app.post(
  "/api/client/payment-methods/confirm",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: "Non authentifié" });
      if (!paymentMethodId) return res.status(400).json({ success: false, message: "paymentMethodId requis" });

      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (!pm.card) {
        return res.status(400).json({ success: false, message: "Moyen de paiement invalide" });
      }

      const brandMap: Record<string, "visa" | "mastercard" | "amex"> = { visa: "visa", mastercard: "mastercard", amex: "amex" };
      const brand = brandMap[pm.card.brand] ?? "visa";

      connection = await db.getConnection();

      const [existingRows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM payment_methods WHERE user_id = ?`,
        [userId]
      ) as [any[], any];
      const isFirstCard = Number(existingRows[0]?.cnt ?? 0) === 0;

      if (isFirstCard) {
        await connection.query(`UPDATE payment_methods SET is_default = FALSE WHERE user_id = ?`, [userId]);
      }

      await connection.query(
        `INSERT INTO payment_methods
         (user_id, brand, last4, exp_month, exp_year, cardholder_name, stripe_pm_id, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          brand,
          pm.card.last4,
          pm.card.exp_month,
          pm.card.exp_year,
          pm.billing_details?.name ?? null,
          paymentMethodId,
          isFirstCard,
        ]
      );

      res.json({ success: true, message: "Carte enregistrée" });
    } catch (error) {
      console.error("Erreur confirm payment method:", error);
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
        `UPDATE payment_methods SET is_default = FALSE WHERE user_id = ?`,
        [userId]
      );

      await connection.query(
        `UPDATE payment_methods SET is_default = TRUE WHERE id = ? AND user_id = ?`,
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

/* FLAG A REVIEW — a pro reporting an unfair/abusive review left on her own
 * profile, feeding the admin moderation queue (GET /api/admin/reviews). */
app.post("/api/reviews/:id/flag", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proId = req.user?.id;
    const reviewId = parseParamToInt(req.params.id);
    const { reason } = req.body as { reason?: string };

    const [reviewRows] = await db.query(`SELECT id, pro_id FROM reviews WHERE id = ?`, [reviewId]);
    const review = (reviewRows as any[])[0];
    if (!review) return res.status(404).json({ success: false, message: "Avis introuvable" });
    if (review.pro_id !== proId) {
      return res.status(403).json({ success: false, message: "Tu ne peux signaler que les avis sur ton propre profil" });
    }

    await db.query(
      `INSERT INTO review_flags (review_id, flagged_by, reason)
       VALUES (?, ?, ?)
       ON CONFLICT (review_id, flagged_by) DO UPDATE SET reason = EXCLUDED.reason`,
      [reviewId, proId, reason ?? null]
    );

    res.json({ success: true, message: "Avis signalé, un admin va l'examiner." });
  } catch (error) {
    console.error("Erreur flag review:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============================================
// CLIENT BOOKING ROUTES
// ============================================

// GET - Récupérer les réservations du client connecté
app.get('/api/client/my-booking', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.id;

    const [rows] = await db.query(
      `SELECT
        r.id,
        r.pro_id,
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
        u.city,
        u.cancellation_notice_hours
      FROM reservations r
      JOIN prestations p ON r.prestation_id = p.id
      JOIN users u ON r.pro_id = u.id
      WHERE r.client_id = ?
      ORDER BY r.start_datetime DESC`,
      [clientId]
    );

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
          // id/activity_name were missing — every list item's pro_id and
          // business name silently fell back to undefined/first+last name
          // (both the mobile app and web read `pro.id`/`pro.activity_name`,
          // not `name`), which broke rescheduling from this list (it needs
          // pro_id to fetch that pro's available slots).
          id: row.pro_id,
          first_name: row.pro_first_name,
          last_name: row.pro_last_name,
          name: row.activity_name,
          activity_name: row.activity_name,
          profile_photo: row.profile_photo,
          city: row.city,
          cancellation_notice_hours: row.cancellation_notice_hours ?? 24
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
            u.city,
            u.geo_precision,
            u.address_line,
            u.postal_code
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

      // Conditional address reveal: the exact address is only shown once the client has
      // an actual reason to go there (booking confirmed or already completed) — never for
      // a merely pending request, and never again once cancelled. This is what lets a pro
      // keep her address private from public browsing while still receiving clients.
      const canRevealAddress = booking.status === "confirmed" || booking.status === "completed";
      delete booking.geo_precision;
      if (!canRevealAddress) {
        delete booking.address_line;
        delete booking.postal_code;
      }

      res.json({ success: true, data: booking });
    } catch (err) {
      console.error("Erreur GET booking-detail:", err);
      res.status(500).json({ success: false, message: "Erreur serveur" });
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
        `SELECT id, status, start_datetime, slot_id, pro_id FROM reservations
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

      log.info("/api/client/bookings/cancel", 200, 0, clientId);

      res.json({
        success: true,
        message: "Réservation annulée avec succès"
      });

      // Notify the pro of the client's cancellation (best-effort, after response)
      try {
        const startAt = new Date(booking.start_datetime);
        const message = `Une cliente a annulé son rendez-vous du ${formatRdvWhen(startAt)}.`;
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'booking_cancelled', 'RDV annulé par la cliente', ?, ?)
           RETURNING id, created_at`,
          [booking.pro_id, message, JSON.stringify({ reservation_id: bookingId })]
        );
        const notif = (notifRows as any[])[0];
        if (notif) {
          await sendNotificationToUser(booking.pro_id, {
            id: notif.id,
            type: "booking_cancelled",
            title: "RDV annulé par la cliente",
            message,
            data: { reservation_id: bookingId },
            created_at: notif.created_at,
          });
        }
      } catch (notifErr) {
        log.warn("/api/client/bookings/cancel", "pro notification error (non-fatal)", { bookingId });
      }

      pushLiveActivityMutation(bookingId, "end").catch(() => {});

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

/* RESCHEDULE BOOKING */
app.patch(
  "/api/client/my-booking/:id/reschedule",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const clientId = req.user?.id;
      const bookingId = parseParamToInt(req.params.id);
      const { start_datetime, end_datetime, slot_id } = req.body;

      if (!clientId) return res.status(401).json({ success: false, message: "Non authentifié" });
      if (isNaN(bookingId)) return res.status(400).json({ success: false, message: "ID invalide" });
      if (!start_datetime || !end_datetime) {
        return res.status(400).json({ success: false, message: "start_datetime et end_datetime requis" });
      }

      const newStart = new Date(start_datetime);
      const newEnd = new Date(end_datetime);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
        return res.status(400).json({ success: false, message: "Dates invalides" });
      }

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT id, status, start_datetime, slot_id, pro_id FROM reservations WHERE id = ? AND client_id = ?`,
        [bookingId, clientId]
      ) as [any[], any];

      if (existing.length === 0) return res.status(404).json({ success: false, message: "Réservation non trouvée" });

      const booking = existing[0];
      if (booking.status === "cancelled") return res.status(400).json({ success: false, message: "Réservation déjà annulée" });
      if (booking.status === "completed") return res.status(400).json({ success: false, message: "Impossible de reporter une réservation terminée" });

      const hoursUntil = (new Date(booking.start_datetime).getTime() - Date.now()) / 3_600_000;
      if (hoursUntil < 24) {
        return res.status(400).json({ success: false, message: "Impossible de reporter moins de 24h avant le rendez-vous" });
      }

      const newSlotId = slot_id ? parseInt(slot_id) : null;

      // Same contention risk POST /api/reservations already guards against
      // (two requests for the same pro racing a check-then-write): this used
      // to be a plain SELECT-then-UPDATE with no transaction at all. Also
      // fixes a second bug — the old slot was freed *before* confirming the
      // new one, so a failed reschedule (new slot taken) left the original
      // slot marked "available" while the reservation still pointed at it,
      // exposing it to being booked out from under the client.
      await connection.beginTransaction();
      try {
        await connection.query(`SELECT pg_advisory_xact_lock(?)`, [booking.pro_id]);

        if (newSlotId) {
          const [slotUpdateRows] = await connection.query(
            `UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'available' RETURNING id`,
            [newSlotId]
          );
          if ((slotUpdateRows as any[]).length === 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Ce créneau n'est plus disponible" });
          }
        } else {
          // No specific slot targeted — still must not collide with another
          // reservation for this pro (mirrors the overlap check in POST
          // /api/reservations, excluding this booking itself).
          const [overlapRows] = await connection.query(
            `SELECT r.id FROM reservations r
             LEFT JOIN prestations prev_p ON prev_p.id = r.prestation_id
             WHERE r.pro_id = ?
               AND r.id != ?
               AND r.status NOT IN ('cancelled', 'rejected')
               AND r.start_datetime < ?
               AND (r.end_datetime + COALESCE(prev_p.buffer_after_minutes, 0) * INTERVAL '1 minute') > ?`,
            [booking.pro_id, bookingId, end_datetime, start_datetime]
          );
          if ((overlapRows as any[]).length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Ce créneau est déjà réservé ou trop proche d'un autre rendez-vous" });
          }
        }

        if (booking.slot_id) {
          await connection.query(`UPDATE slots SET status = 'available' WHERE id = ?`, [booking.slot_id]);
        }

        await connection.query(
          `UPDATE reservations SET start_datetime = ?, end_datetime = ?, slot_id = ? WHERE id = ?`,
          [start_datetime, end_datetime, newSlotId, bookingId]
        );

        await connection.commit();
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      }

      res.json({ success: true, message: "Rendez-vous reporté avec succès" });

      // Notify the pro of the client's reschedule (best-effort, after response)
      try {
        const message = `Une cliente a reporté son rendez-vous au ${formatRdvWhen(newStart)}.`;
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'booking_rescheduled', 'RDV reporté par la cliente', ?, ?)
           RETURNING id, created_at`,
          [booking.pro_id, message, JSON.stringify({ reservation_id: bookingId })]
        );
        const notif = (notifRows as any[])[0];
        if (notif) {
          await sendNotificationToUser(booking.pro_id, {
            id: notif.id,
            type: "booking_rescheduled",
            title: "RDV reporté par la cliente",
            message,
            data: { reservation_id: bookingId },
            created_at: notif.created_at,
          });
        }
      } catch (notifErr) {
        log.warn("/api/client/bookings/reschedule", "pro notification error (non-fatal)", { bookingId });
      }

      pushLiveActivityMutation(bookingId, "update").catch(() => {});
    } catch (error) {
      console.error("❌ Error rescheduling booking:", error);
      res.status(500).json({ success: false, message: "Erreur lors du report" });
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

    const [favRows] = await connection.query(
      "INSERT INTO favorites (client_id, pro_id) VALUES (?, ?) RETURNING id",
      [clientId, pro_id]
    );

    res.json({
      success: true,
      message: "Ajouté aux favoris",
      data: {
        id: (favRows as any[])[0]?.id,
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
      "DELETE FROM favorites WHERE client_id = ? AND pro_id = ? RETURNING id",
      [clientId, proId]
    );

    if ((result as any[]).length === 0) {
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
    const { pro_id, prestation_id, start_datetime, end_datetime, slot_id, payment_method } = req.body;
    const paidOnline = payment_method === "online";

    // Verify prestation belongs to the given pro + get its name, price and buffer
    // for the deposit calculation, notification and overlap check. The price is
    // always read from here — never trusted from the client request body — so a
    // tampered request can't book a prestation for an arbitrary amount.
    const [prestationRows] = await db.query(
      `SELECT id, name, price, buffer_after_minutes FROM prestations WHERE id = ? AND pro_id = ?`,
      [prestation_id, pro_id]
    );
    if ((prestationRows as any[]).length === 0) {
      return res.status(403).json({ success: false, message: "Prestation invalide pour ce professionnel" });
    }
    const prestationName = (prestationRows as any[])[0].name as string;
    const price = Number((prestationRows as any[])[0].price);

    // Guard: client must not be blacklisted by this pro
    const [blockedRows] = await db.query(
      `SELECT id FROM blocked_clients WHERE pro_id = ? AND client_id = ?`,
      [pro_id, clientId]
    );
    if ((blockedRows as any[]).length > 0) {
      return res.status(403).json({ success: false, message: "Réservation impossible avec ce professionnel." });
    }

    // Everything below is contention-sensitive (two clients racing for the
    // same slot/time) and must be serialized. A Postgres advisory lock keyed
    // on pro_id — held for the transaction's duration — means a second
    // concurrent booking attempt for the same pro blocks here instead of
    // reading the same "still available" state and double-booking. Neither
    // the slot check nor the overlap check previously re-verified anything
    // at write time, so two near-simultaneous requests could both pass and
    // both insert.
    const connection = await db.getConnection();
    let insertId: number;
    let depositPct: number;
    let depositAmount: number | null;
    try {
      await connection.beginTransaction();
      await connection.query(`SELECT pg_advisory_xact_lock(?)`, [pro_id]);

      // If a slot_id is provided, verify it is still available (owned by pro)
      if (slot_id) {
        const [slotRows] = await connection.query(
          `SELECT status FROM slots WHERE id = ? AND pro_id = ?`,
          [slot_id, pro_id]
        );
        const slot = (slotRows as any[])[0];
        if (!slot || slot.status !== "available") {
          await connection.rollback();
          return res.status(409).json({ success: false, message: "Ce créneau n'est plus disponible" });
        }
      }

      // Prevent overlapping reservations with the same pro.
      // Also respects buffer_after_minutes of existing prestations:
      // if an existing appointment ends at T with a 15-min buffer, the new one cannot start before T+15.
      const [overlapRows] = await connection.query(
        `SELECT r.id FROM reservations r
         LEFT JOIN prestations prev_p ON prev_p.id = r.prestation_id
         WHERE r.pro_id = ?
           AND r.status NOT IN ('cancelled', 'rejected')
           AND r.start_datetime < ?
           AND (r.end_datetime + COALESCE(prev_p.buffer_after_minutes, 0) * INTERVAL '1 minute') > ?`,
        [pro_id, end_datetime, start_datetime]
      );
      if ((overlapRows as any[]).length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: "Ce créneau est déjà réservé ou trop proche d'un autre rendez-vous" });
      }

      // Get pro's deposit percentage
      const [proRows] = await connection.query(
        `SELECT deposit_percentage, stripe_onboarding_complete FROM users WHERE id = ?`,
        [pro_id]
      );
      const pro = (proRows as any[])[0];
      if (!pro) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "Professionnel introuvable" });
      }
      depositPct = pro.deposit_percentage ?? 50;
      depositAmount = depositPct > 0 ? Math.round(price * depositPct) / 100 : null;

      const [resaRows] = await connection.execute(
        `INSERT INTO reservations (client_id, pro_id, prestation_id, start_datetime, end_datetime, status, price, payment_status, deposit_amount, paid_online, slot_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'confirmed', ?, 'unpaid', ?, ?, ?, NOW()) RETURNING id`,
        [clientId, pro_id, prestation_id, start_datetime, end_datetime, price, depositAmount, paidOnline, slot_id || null]
      );

      insertId = (resaRows as any[])[0]?.id;

      // If slot_id, mark the slot as booked — re-checked against 'available'
      // one more time (belt and suspenders with the advisory lock above).
      if (slot_id) {
        const [slotUpdateRows] = await connection.query(
          `UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'available' RETURNING id`,
          [slot_id]
        );
        if ((slotUpdateRows as any[]).length === 0) {
          await connection.rollback();
          return res.status(409).json({ success: false, message: "Ce créneau n'est plus disponible" });
        }
      }

      await connection.commit();
    } catch (txErr) {
      await connection.rollback().catch(() => {});
      throw txErr;
    } finally {
      connection.release();
    }

    // ── Notify pro of new booking with full details (best-effort) ─────────────
    try {
      // Fetch client name
      const [clientRows] = await db.query(
        `SELECT first_name, last_name FROM users WHERE id = ?`,
        [clientId]
      );
      const client = (clientRows as any[])[0];
      const clientName = client ? `${client.first_name} ${client.last_name}` : "Un client";

      const startAt = new Date(start_datetime);
      // Kept separately (not just parsed back out of notifMessage) because
      // the `data` payload below is structured data for the client, not
      // display text.
      const dateStr = formatRdvDate(startAt);
      const timeStr = formatRdvTime(startAt);
      const paymentLabel = paidOnline
        ? depositAmount
          ? `acompte de ${formatEuros(depositAmount)}€ réglé en ligne (total ${formatEuros(price)}€)`
          : `${formatEuros(price)}€ réglés en ligne`
        : `${formatEuros(price)}€ à encaisser sur place`;

      const notifMessage = `${clientName} a réservé « ${prestationName} » le ${formatRdvWhen(startAt)} — ${paymentLabel}.`;

      const [notifRows] = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'new_booking', 'Nouveau rendez-vous', ?, ?)
         RETURNING id, created_at`,
        [
          pro_id,
          notifMessage,
          JSON.stringify({
            reservation_id: insertId,
            prestation: prestationName,
            date: dateStr,
            time: timeStr,
            price: price,
            deposit_amount: depositAmount,
            payment_method: payment_method ?? "on_site",
          }),
        ]
      );
      const notif = (notifRows as any[])[0];
      if (notif) {
        await sendNotificationToUser(pro_id, {
          id: notif.id,
          type: "new_booking",
          title: "Nouveau rendez-vous",
          message: notifMessage,
          data: { reservation_id: insertId },
          created_at: notif.created_at,
        });
      }
    } catch (notifErr) {
      log.warn("[RESERVATION_CREATE]", "Pro notification failed (non-fatal)", { reservationId: insertId });
    }

    return res.json({
      success: true,
      data: {
        id: insertId,
        deposit_percentage: depositPct,
        deposit_amount: depositAmount,
        price: price,
      },
    });
  } catch (error) {
    console.error("[RESERVATION_CREATE] Error:", error);
    // The prestation existence check above runs before the transaction, so a
    // pro deleting that prestation in the narrow window between the check
    // and the INSERT (e.g. mid-checkout on the client) surfaces here as a
    // foreign key violation rather than the earlier 403 — give it the same
    // clear, actionable message instead of a generic 500.
    if ((error as { code?: string })?.code === "23503") {
      return res.status(409).json({ success: false, message: "Cette prestation n'est plus disponible. Merci de rafraîchir la page." });
    }
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

    // Get reservation + pro stripe info in a single JOIN
    const [resaRows] = await db.query(
      `SELECT r.id, r.pro_id, r.client_id, r.price, r.total_paid, r.deposit_amount, r.payment_status,
              u.stripe_account_id, u.stripe_onboarding_complete
       FROM reservations r
       JOIN users u ON u.id = r.pro_id
       WHERE r.id = ?`,
      [reservation_id]
    );
    const reservation = (resaRows as any[])[0];
    if (!reservation) {
      return res.status(404).json({ success: false, message: "Réservation non trouvée" });
    }
    if (reservation.client_id !== clientId) {
      return res.status(403).json({ success: false, message: "Accès non autorisé" });
    }
    if (!reservation.stripe_account_id || !reservation.stripe_onboarding_complete) {
      return res.status(400).json({ success: false, message: "Le professionnel n'a pas configuré ses paiements Stripe" });
    }

    // Guard: reject if already fully paid or if deposit already paid when requesting deposit
    if (reservation.payment_status === "fully_paid" || reservation.payment_status === "paid_on_site") {
      return res.status(409).json({ success: false, message: "Cette réservation est déjà entièrement payée" });
    }
    if (type === "deposit" && reservation.payment_status === "deposit_paid") {
      return res.status(409).json({ success: false, message: "L'acompte a déjà été payé pour cette réservation" });
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
      return res.status(400).json({ success: false, message: "Montant invalide ou déjà payé" });
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
        destination: reservation.stripe_account_id,
      },
    });

    // Record payment in DB. A unique index on (reservation_id, type) for
    // non-terminal statuses guards against two concurrent requests (double
    // tap, retry) both passing the earlier "not already paid" check and
    // each creating a separate Stripe PaymentIntent for the same charge.
    try {
      await db.execute(
        `INSERT INTO payments (reservation_id, client_id, pro_id, type, amount, stripe_payment_intent_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [reservation_id, clientId, reservation.pro_id, type, amount, paymentIntent.id]
      );
    } catch (dbError: any) {
      if (dbError?.code === "23505") {
        // Another request already has an active payment for this reservation+type.
        // Cancel this now-orphaned PaymentIntent so it can't be confirmed later.
        await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
        return res.status(409).json({
          success: false,
          message: "Un paiement est déjà en cours pour cette réservation",
        });
      }
      throw dbError;
    }

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
// GLOBAL ERROR HANDLER
// ==========================================

// Sentry error handler — must be before custom error handler
if (process.env.SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(Sentry.expressErrorHandler() as any);
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
    console.info(`Backend running on http://localhost:${PORT}`);
    startReminderCron();
    startDataRetentionCron();
    startPaymentCleanupCron();
    startRecallCron();
    startSubscriptionExpiryCron();
    startFinanceReportsCron();
    startDailyRecapCron();
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