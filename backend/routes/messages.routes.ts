/**
 * "Écrire à sa pro" — fil de discussion client↔pro.
 *
 * Un seul fil par paire (client_id, pro_id), ouvrable avant toute réservation
 * (bouton "Écrire" sur la fiche pro) et épinglé au dernier rendez-vous une
 * fois qu'il existe. Modération sur signalement uniquement — jamais de
 * lecture proactive des fils par l'équipe Blyss (voir POST /:id/report et
 * backend/routes/admin.routes.ts pour la file de modération).
 *
 * Filtre anti-contournement : un message contenant un numéro de téléphone ou
 * un email est refusé (400), pas masqué — plus simple à raisonner côté
 * client qu'un envoi "partiellement" bloqué.
 */

import express, { Response, NextFunction } from "express";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../lib/db";
import { sendNotificationToUser } from "../lib/notifications";
import { parseParamToInt } from "../lib/helpers";
import { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

const UPLOADS_DIR = path.resolve(
  __dirname,
  "..",
  process.env.NODE_ENV === "production" ? "../uploads" : "uploads"
);
const uploadChatDir = path.join(UPLOADS_DIR, "chat");
if (!fs.existsSync(uploadChatDir)) {
  fs.mkdirSync(uploadChatDir, { recursive: true });
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) cb(null, true);
  else cb(new Error("Seuls les fichiers JPEG, PNG ou WebP sont autorisés"));
};
const uploadChatPhoto = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Filtre anti-contournement ────────────────────────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/;

function containsContactInfo(text: string): boolean {
  return EMAIL_RE.test(text) || PHONE_RE.test(text);
}

// Combien de fils un compte n'ayant jamais réservé chez cette pro peut lui
// ouvrir sur 24h, pour éviter le démarchage en masse plutôt qu'une vraie
// question de cliente (voir artefact produit "Écrire à sa pro").
const COLD_THREAD_WINDOW_HOURS = 24;
const COLD_THREAD_MAX_PER_PRO = 25;

// ── Helpers ───────────────────────────────────────────────────────────────

async function getRole(userId: number): Promise<string | undefined> {
  const db = getDb();
  const [rows] = await db.query("SELECT role FROM users WHERE id = ?", [userId]);
  return (rows as any[])[0]?.role;
}

function threadPreview(body: string | null, hasAttachment: boolean): string {
  if (body) return body.length > 140 ? `${body.slice(0, 140)}…` : body;
  return hasAttachment ? "📷 Photo" : "";
}

// ── GET /threads — liste des fils de l'utilisateur connecté ───────────────
router.get("/threads", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = await getRole(userId);
    if (role !== "client" && role !== "pro") {
      return res.status(403).json({ success: false, message: "Rôle non autorisé" });
    }

    const isClient = role === "client";
    const db = getDb();
    const [rows] = await db.query(
      `SELECT
         t.id, t.last_message_at, t.last_message_preview, t.last_reservation_id,
         ${isClient ? "t.client_unread_count" : "t.pro_unread_count"} AS unread_count,
         u.id AS other_id,
         COALESCE(NULLIF(TRIM(u.activity_name), ''), u.first_name || ' ' || u.last_name) AS other_name,
         u.profile_photo AS other_photo,
         r.status AS reservation_status
       FROM message_threads t
       JOIN users u ON u.id = ${isClient ? "t.pro_id" : "t.client_id"}
       LEFT JOIN reservations r ON r.id = t.last_reservation_id
       WHERE ${isClient ? "t.client_id" : "t.pro_id"} = ?
       ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Erreur liste des fils:", error);
    res.status(500).json({ success: false, message: "Erreur lors du chargement des messages" });
  }
});

// ── POST /threads — ouvre (ou récupère) le fil avec une pro ───────────────
// Toujours initié côté client — une pro ne peut pas ouvrir un fil, seulement
// y répondre une fois qu'une cliente l'a fait.
router.post("/threads", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const role = await getRole(clientId);
    if (role !== "client") {
      return res.status(403).json({ success: false, message: "Seul un compte client peut démarrer une conversation" });
    }

    const { proId, reservationId } = req.body as { proId?: number; reservationId?: number };
    const proIdNum = Number(proId);
    if (!proIdNum || Number.isNaN(proIdNum)) {
      return res.status(400).json({ success: false, message: "proId invalide" });
    }

    const db = getDb();
    const [proRows] = await db.query(
      "SELECT id, is_active, pro_status, profile_visibility FROM users WHERE id = ? AND role = 'pro'",
      [proIdNum]
    );
    const proRow = (proRows as any[])[0];
    if (!proRow) {
      return res.status(404).json({ success: false, message: "Professionnelle introuvable" });
    }

    const [existing] = await db.query(
      "SELECT id FROM message_threads WHERE client_id = ? AND pro_id = ?",
      [clientId, proIdNum]
    );
    const existingThread = (existing as any[])[0];

    if (existingThread) {
      if (reservationId) {
        await db.query("UPDATE message_threads SET last_reservation_id = ? WHERE id = ?", [reservationId, existingThread.id]);
      }
      return res.json({ success: true, data: { id: existingThread.id } });
    }

    // Un tout nouveau fil exige que la pro soit active/visible — contacter
    // une pro bannie ou privée pour la première fois ne doit pas être
    // possible. Une conversation déjà entamée reste consultable même si
    // son statut change ensuite (voir le "return" plus haut, avant ce check).
    if (!proRow.is_active || proRow.pro_status !== "active" || proRow.profile_visibility !== "public") {
      return res.status(404).json({ success: false, message: "Professionnelle introuvable" });
    }

    // Garde-fou anti-démarchage : seuls les fils "à froid" (jamais réservé
    // chez cette pro) comptent — une cliente qui a déjà un historique avec
    // elle n'est jamais bloquée par cette limite.
    const [reservedBefore] = await db.query(
      "SELECT id FROM reservations WHERE client_id = ? AND pro_id = ? LIMIT 1",
      [clientId, proIdNum]
    );
    if ((reservedBefore as any[]).length === 0) {
      const [coldCountRows] = await db.query(
        `SELECT COUNT(*) AS count FROM message_threads t
         WHERE t.pro_id = ? AND t.created_at > NOW() - INTERVAL '${COLD_THREAD_WINDOW_HOURS} hours'
           AND NOT EXISTS (
             SELECT 1 FROM reservations res WHERE res.client_id = t.client_id AND res.pro_id = t.pro_id
           )`,
        [proIdNum]
      );
      const coldCount = Number((coldCountRows as any[])[0]?.count ?? 0);
      if (coldCount >= COLD_THREAD_MAX_PER_PRO) {
        return res.status(429).json({ success: false, message: "Cette professionnelle reçoit déjà beaucoup de nouvelles demandes, réessaie plus tard." });
      }
    }

    const [rows] = await db.query(
      `INSERT INTO message_threads (client_id, pro_id, last_reservation_id) VALUES (?, ?, ?) RETURNING id`,
      [clientId, proIdNum, reservationId ?? null]
    );
    res.json({ success: true, data: { id: (rows as any[])[0].id } });
  } catch (error) {
    console.error("Erreur création fil:", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'ouverture de la conversation" });
  }
});

// ── GET /threads/:id — détail + messages, marque comme lu ─────────────────
router.get("/threads/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const threadId = parseParamToInt(req.params.id);
    const db = getDb();

    const [threadRows] = await db.query(
      `SELECT t.*,
         cu.first_name AS client_first_name, cu.last_name AS client_last_name, cu.profile_photo AS client_photo,
         COALESCE(NULLIF(TRIM(pu.activity_name), ''), pu.first_name || ' ' || pu.last_name) AS pro_name,
         pu.profile_photo AS pro_photo,
         r.status AS reservation_status
       FROM message_threads t
       JOIN users cu ON cu.id = t.client_id
       JOIN users pu ON pu.id = t.pro_id
       LEFT JOIN reservations r ON r.id = t.last_reservation_id
       WHERE t.id = ?`,
      [threadId]
    );
    const thread = (threadRows as any[])[0];
    if (!thread || (thread.client_id !== userId && thread.pro_id !== userId)) {
      return res.status(404).json({ success: false, message: "Conversation introuvable" });
    }
    const isClient = thread.client_id === userId;

    const [messages] = await db.query(
      `SELECT id, sender_id, body, attachment_url, attachment_thumbnail, created_at, read_at
       FROM messages WHERE thread_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 200`,
      [threadId]
    );

    // Marque comme lus les messages de l'autre partie + remet le compteur à zéro
    await db.query(
      `UPDATE messages SET read_at = NOW() WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
      [threadId, userId]
    );
    await db.query(
      `UPDATE message_threads SET ${isClient ? "client_unread_count" : "pro_unread_count"} = 0 WHERE id = ?`,
      [threadId]
    );

    res.json({
      success: true,
      data: {
        id: thread.id,
        otherName: isClient ? thread.pro_name : `${thread.client_first_name} ${thread.client_last_name}`,
        otherPhoto: isClient ? thread.pro_photo : thread.client_photo,
        lastReservationId: thread.last_reservation_id,
        reservationStatus: thread.reservation_status,
        messages,
      },
    });
  } catch (error) {
    console.error("Erreur détail fil:", error);
    res.status(500).json({ success: false, message: "Erreur lors du chargement de la conversation" });
  }
});

// ── POST /threads/:id/messages — envoyer un message (texte et/ou photo) ───
router.post(
  "/threads/:id/messages",
  authMiddleware,
  uploadChatPhoto.single("photo"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const threadId = parseParamToInt(req.params.id);
      const rawBody = (req.body as { body?: string }).body;
      const body = typeof rawBody === "string" && rawBody.trim() ? rawBody.trim().slice(0, 2000) : null;

      if (!body && !req.file) {
        return res.status(400).json({ success: false, message: "Message vide" });
      }
      if (body && containsContactInfo(body)) {
        return res.status(400).json({
          success: false,
          message: "Merci de ne pas partager de numéro ou d'email ici — tout se passe dans l'app Blyss.",
        });
      }

      const db = getDb();
      const [threadRows] = await db.query("SELECT client_id, pro_id FROM message_threads WHERE id = ?", [threadId]);
      const thread = (threadRows as any[])[0];
      if (!thread || (thread.client_id !== userId && thread.pro_id !== userId)) {
        return res.status(404).json({ success: false, message: "Conversation introuvable" });
      }
      const isClient = thread.client_id === userId;
      const recipientId = isClient ? thread.pro_id : thread.client_id;

      let attachmentUrl: string | null = null;
      let attachmentThumbnail: string | null = null;
      if (req.file) {
        const base = `chat_${threadId}_${Date.now()}`;
        const fullFilename = `${base}.webp`;
        const thumbFilename = `${base}_thumb.webp`;
        await sharp(req.file.buffer).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(uploadChatDir, fullFilename));
        await sharp(req.file.buffer).resize(300, 300, { fit: "cover", position: "center" }).webp({ quality: 75 }).toFile(path.join(uploadChatDir, thumbFilename));
        attachmentUrl = `/uploads/chat/${fullFilename}`;
        attachmentThumbnail = `/uploads/chat/${thumbFilename}`;
      }

      const [msgRows] = await db.query(
        `INSERT INTO messages (thread_id, sender_id, body, attachment_url, attachment_thumbnail)
         VALUES (?, ?, ?, ?, ?) RETURNING id, created_at`,
        [threadId, userId, body, attachmentUrl, attachmentThumbnail]
      );
      const message = (msgRows as any[])[0];

      await db.query(
        `UPDATE message_threads SET
           last_message_at = ?, last_message_preview = ?,
           ${isClient ? "pro_unread_count = pro_unread_count + 1" : "client_unread_count = client_unread_count + 1"}
         WHERE id = ?`,
        [message.created_at, threadPreview(body, !!attachmentUrl), threadId]
      );

      res.json({
        success: true,
        data: { id: message.id, sender_id: userId, body, attachment_url: attachmentUrl, attachment_thumbnail: attachmentThumbnail, created_at: message.created_at },
      });

      // Best-effort, après la réponse — un échec de notification ne doit
      // jamais faire échouer l'envoi du message lui-même.
      try {
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'new_message', 'Nouveau message', ?, ?)
           RETURNING id, created_at`,
          [recipientId, threadPreview(body, !!attachmentUrl), JSON.stringify({ thread_id: threadId })]
        );
        const notif = (notifRows as any[])[0];
        if (notif) {
          await sendNotificationToUser(recipientId, {
            id: notif.id,
            type: "new_message",
            title: "Nouveau message",
            message: threadPreview(body, !!attachmentUrl),
            data: { thread_id: threadId },
            created_at: notif.created_at,
          });
        }
      } catch (notifError) {
        console.error("Erreur notification nouveau message:", notifError);
      }
    } catch (error) {
      console.error("Erreur envoi message:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'envoi du message" });
    }
  }
);

// ── POST /threads/:id/report — signale le fil (modération admin) ──────────
router.post("/threads/:id/report", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const threadId = parseParamToInt(req.params.id);
    let { reason } = req.body as { reason?: string };
    if (reason != null) {
      if (typeof reason !== "string") return res.status(400).json({ success: false, message: "reason invalide" });
      reason = reason.slice(0, 500);
    }

    const db = getDb();
    const [threadRows] = await db.query("SELECT client_id, pro_id FROM message_threads WHERE id = ?", [threadId]);
    const thread = (threadRows as any[])[0];
    if (!thread || (thread.client_id !== userId && thread.pro_id !== userId)) {
      return res.status(404).json({ success: false, message: "Conversation introuvable" });
    }

    await db.query(
      `INSERT INTO message_flags (thread_id, flagged_by, reason)
       VALUES (?, ?, ?)
       ON CONFLICT (thread_id, flagged_by) DO UPDATE SET reason = EXCLUDED.reason`,
      [threadId, userId, reason ?? null]
    );

    res.json({ success: true, message: "Merci, un membre de l'équipe Blyss va examiner cette conversation." });
  } catch (error) {
    console.error("Erreur signalement fil:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

export default router;
