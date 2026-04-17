/**
 * Nail-tech specific business logic routes.
 *
 * POST   /api/pro/reservations/:id/no-show          — marquer une absence (no-show)
 * GET    /api/pro/clients/:clientId/notes            — lire la fiche enrichie d'une cliente
 * PATCH  /api/pro/clients/:clientId/notes            — mettre à jour la fiche (allergies, forme, style, patch test)
 * POST   /api/pro/clients/:clientId/block            — blacklister une cliente
 * DELETE /api/pro/clients/:clientId/block            — retirer du blacklist
 * GET    /api/pro/blocked-clients                    — liste des clientes blacklistées
 * POST   /api/waiting-list                           — cliente s'inscrit en liste d'attente pour un pro
 * DELETE /api/waiting-list/:proId                    — cliente se retire de la liste d'attente
 * GET    /api/client/waiting-list                    — liste d'attente du client connecté
 */

import express, { Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate, clientNotesSchema } from "../middleware/validate";
import { waitingListLimiter, nailTechWriteLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { sendNotificationToUser } from "../lib/notifications";
import { parseParamToInt } from "../lib/helpers";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function errStack(e: unknown): string | undefined {
  return e instanceof Error ? e.stack : undefined;
}

/** Vérifie que l'utilisateur connecté a le rôle 'pro'. Retourne true si autorisé, sinon envoie 403 et retourne false. */
async function requirePro(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  const db = getDb();
  const [rows] = await db.query(`SELECT role FROM users WHERE id = ?`, [req.user!.id]);
  const users = rows as Array<{ role: string }>;
  if (users.length === 0 || users[0].role !== "pro") {
    res.status(403).json({ success: false, error: "forbidden", message: "Accès réservé aux professionnels." });
    return false;
  }
  return true;
}

// ── PATCH /api/pro/reservations/:id/no-show ───────────────────────────────────
/**
 * Le pro marque une cliente comme absente (no-show).
 * - La réservation passe en status='cancelled', is_no_show=TRUE
 * - L'acompte est conservé (aucun remboursement)
 * - La cliente reçoit une notification
 * - Le slot est libéré pour un rebook futur
 */
router.patch(
  "/pro/reservations/:id/no-show",
  authMiddleware,
  nailTechWriteLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    let reservationId: number;
    try {
      reservationId = parseParamToInt(req.params["id"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param", message: "ID invalide." });
      return;
    }

    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;

      // Verify ownership + status
      const [rows] = await db.query(
        `SELECT id, status, client_id, slot_id, start_datetime, is_no_show
         FROM reservations WHERE id = ? AND pro_id = ?`,
        [reservationId, proId]
      );
      const reservation = (rows as any[])[0];

      if (!reservation) {
        res.status(404).json({ success: false, error: "not_found", message: "Réservation introuvable." });
        return;
      }
      if (reservation.status === "cancelled" || reservation.status === "completed") {
        res.status(409).json({ success: false, error: "already_finalized", message: "Réservation déjà finalisée." });
        return;
      }
      if (reservation.is_no_show) {
        res.status(409).json({ success: false, error: "already_no_show", message: "Déjà marquée absente." });
        return;
      }

      // Check the appointment time has passed (can only mark no-show after the start time)
      const startAt = new Date(reservation.start_datetime);
      if (startAt > new Date()) {
        res.status(422).json({
          success: false,
          error: "appointment_not_started",
          message: "Impossible de marquer une absence avant l'heure du rendez-vous.",
        });
        return;
      }

      // Mark no-show + free slot
      await db.execute(
        `UPDATE reservations
         SET status = 'cancelled', is_no_show = TRUE, cancelled_by = 'system', updated_at = NOW()
         WHERE id = ?`,
        [reservationId]
      );

      if (reservation.slot_id) {
        await db.execute(
          `UPDATE slots SET status = 'available', updated_at = NOW() WHERE id = ? AND status = 'booked'`,
          [reservation.slot_id]
        );
      }

      // Notify client (best-effort)
      try {
        const dateStr = startAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'no_show', 'Absence notée', ?, ?)
           RETURNING id, created_at`,
          [
            reservation.client_id,
            `Votre absence à votre rendez-vous du ${dateStr} a été enregistrée. Votre acompte a été retenu.`,
            JSON.stringify({ reservation_id: reservationId }),
          ]
        );
        const notif = (notifRows as any[])[0];
        if (notif) {
          await sendNotificationToUser(reservation.client_id, {
            id: notif.id,
            type: "no_show",
            title: "Absence notée",
            message: `Votre absence du ${dateStr} a été notée. L'acompte est retenu.`,
            data: { reservation_id: reservationId },
            created_at: notif.created_at,
          });
        }
      } catch {
        log.warn("nail-tech/no-show", "Client notification failed (non-fatal)", { reservationId });
      }

      log.warn("nail-tech/no-show", "No-show recorded", { reservationId, proId, clientId: reservation.client_id });

      res.json({ success: true, message: "Absence enregistrée. L'acompte est conservé." });
    } catch (e) {
      log.error("nail-tech/no-show", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── GET /api/pro/clients/:clientId/notes ──────────────────────────────────────
/**
 * Lit la fiche enrichie d'une cliente (notes libres + données nail-tech).
 */
router.get(
  "/pro/clients/:clientId/notes",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    let clientId: number;
    try {
      clientId = parseParamToInt(req.params["clientId"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param" });
      return;
    }

    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;

      // Relationship check: the client must have had at least one booking with this pro
      const [relRows] = await db.query(
        `SELECT id FROM reservations WHERE pro_id = ? AND client_id = ? LIMIT 1`,
        [proId, clientId]
      );
      if ((relRows as any[]).length === 0) {
        res.status(403).json({ success: false, error: "forbidden", message: "Aucun rendez-vous avec cette cliente." });
        return;
      }

      const [rows] = await db.query(
        `SELECT n.notes, n.allergies, n.preferred_shape, n.preferred_style,
                n.patch_test_done, n.patch_test_date, n.updated_at,
                u.first_name, u.last_name, u.email, u.phone_number
         FROM pro_client_notes n
         JOIN users u ON u.id = n.client_id
         WHERE n.pro_id = ? AND n.client_id = ?`,
        [proId, clientId]
      );

      if ((rows as any[]).length === 0) {
        // Return empty fiche — no error
        const [userRows] = await db.query(
          `SELECT first_name, last_name, email, phone_number FROM users WHERE id = ?`,
          [clientId]
        );
        const user = (userRows as any[])[0];
        if (!user) {
          res.status(404).json({ success: false, error: "not_found" });
          return;
        }
        res.json({ success: true, data: { ...user, notes: null, allergies: null, preferred_shape: null, preferred_style: null, patch_test_done: false, patch_test_date: null } });
        return;
      }

      res.json({ success: true, data: (rows as any[])[0] });
    } catch (e) {
      log.error("nail-tech/client-notes/get", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── PATCH /api/pro/clients/:clientId/notes ───────────────────────────────────
/**
 * Met à jour la fiche enrichie (upsert).
 * Champs acceptés : notes, allergies, preferred_shape, preferred_style,
 *                   patch_test_done, patch_test_date.
 */
router.patch(
  "/pro/clients/:clientId/notes",
  authMiddleware,
  nailTechWriteLimiter,
  validate(clientNotesSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    let clientId: number;
    try {
      clientId = parseParamToInt(req.params["clientId"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param" });
      return;
    }

    const { notes, allergies, preferred_shape, preferred_style, patch_test_done, patch_test_date } = req.body;

    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;

      // Relationship check
      const [relRows] = await db.query(
        `SELECT id FROM reservations WHERE pro_id = ? AND client_id = ? LIMIT 1`,
        [proId, clientId]
      );
      if ((relRows as any[]).length === 0) {
        res.status(403).json({ success: false, error: "forbidden", message: "Aucun rendez-vous avec cette cliente." });
        return;
      }
      await db.execute(
        `INSERT INTO pro_client_notes (pro_id, client_id, notes, allergies, preferred_shape, preferred_style, patch_test_done, patch_test_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (pro_id, client_id) DO UPDATE SET
           notes           = COALESCE(EXCLUDED.notes,           pro_client_notes.notes),
           allergies       = COALESCE(EXCLUDED.allergies,       pro_client_notes.allergies),
           preferred_shape = COALESCE(EXCLUDED.preferred_shape, pro_client_notes.preferred_shape),
           preferred_style = COALESCE(EXCLUDED.preferred_style, pro_client_notes.preferred_style),
           patch_test_done = COALESCE(EXCLUDED.patch_test_done, pro_client_notes.patch_test_done),
           patch_test_date = COALESCE(EXCLUDED.patch_test_date, pro_client_notes.patch_test_date),
           updated_at      = NOW()`,
        [
          proId, clientId,
          notes ?? null,
          allergies ?? null,
          preferred_shape ?? null,
          preferred_style ?? null,
          patch_test_done ?? false,
          patch_test_date ?? null,
        ]
      );

      res.json({ success: true, message: "Fiche cliente mise à jour." });
    } catch (e) {
      log.error("nail-tech/client-notes/patch", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── POST /api/pro/clients/:clientId/block ─────────────────────────────────────
router.post(
  "/pro/clients/:clientId/block",
  authMiddleware,
  nailTechWriteLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    let clientId: number;
    try {
      clientId = parseParamToInt(req.params["clientId"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param" });
      return;
    }

    const reason: string | undefined = typeof req.body?.reason === "string"
      ? req.body.reason.slice(0, 300)
      : undefined;

    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;
      await db.execute(
        `INSERT INTO blocked_clients (pro_id, client_id, reason)
         VALUES (?, ?, ?)
         ON CONFLICT (pro_id, client_id) DO UPDATE SET reason = EXCLUDED.reason`,
        [proId, clientId, reason ?? null]
      );
      log.warn("nail-tech/block", "Client blocked", { proId, clientId });
      res.json({ success: true, message: "Cliente bloquée." });
    } catch (e) {
      log.error("nail-tech/block", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── DELETE /api/pro/clients/:clientId/block ───────────────────────────────────
router.delete(
  "/pro/clients/:clientId/block",
  authMiddleware,
  nailTechWriteLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    let clientId: number;
    try {
      clientId = parseParamToInt(req.params["clientId"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param" });
      return;
    }

    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;
      await db.execute(
        `DELETE FROM blocked_clients WHERE pro_id = ? AND client_id = ?`,
        [proId, clientId]
      );
      res.json({ success: true, message: "Cliente débloquée." });
    } catch (e) {
      log.error("nail-tech/unblock", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── GET /api/pro/blocked-clients ──────────────────────────────────────────────
router.get(
  "/pro/blocked-clients",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proId = req.user!.id;
    try {
      const db = getDb();
      if (!(await requirePro(req, res))) return;
      const [rows] = await db.query(
        `SELECT bc.id, bc.client_id, bc.reason, bc.created_at,
                u.first_name, u.last_name, u.email, u.profile_photo
         FROM blocked_clients bc
         JOIN users u ON u.id = bc.client_id
         WHERE bc.pro_id = ?
         ORDER BY bc.created_at DESC`,
        [proId]
      );
      res.json({ success: true, data: rows });
    } catch (e) {
      log.error("nail-tech/blocked-list", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── POST /api/waiting-list ────────────────────────────────────────────────────
/**
 * La cliente s'inscrit sur la liste d'attente d'un pro.
 * Si un créneau se libère (annulation), le pro et la cliente sont notifiés.
 */
router.post(
  "/waiting-list",
  authMiddleware,
  waitingListLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const clientId = req.user!.id;
    const { pro_id, prestation_id, preferred_date, note } = req.body;

    if (!pro_id || typeof pro_id !== "number") {
      res.status(400).json({ success: false, error: "validation_error", message: "pro_id requis." });
      return;
    }

    try {
      const db = getDb();

      // Verify pro exists
      const [proRows] = await db.query(`SELECT id FROM users WHERE id = ? AND role = 'pro'`, [pro_id]);
      if ((proRows as any[]).length === 0) {
        res.status(404).json({ success: false, error: "not_found", message: "Professionnel introuvable." });
        return;
      }

      await db.execute(
        `INSERT INTO waiting_list (pro_id, client_id, prestation_id, preferred_date, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (pro_id, client_id) DO UPDATE SET
           prestation_id  = EXCLUDED.prestation_id,
           preferred_date = EXCLUDED.preferred_date,
           note           = EXCLUDED.note,
           notified_at    = NULL`,
        [pro_id, clientId, prestation_id ?? null, preferred_date ?? null, note?.slice(0, 300) ?? null]
      );

      res.json({ success: true, message: "Vous êtes inscrite sur la liste d'attente." });
    } catch (e) {
      log.error("nail-tech/waiting-list/post", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── DELETE /api/waiting-list/:proId ───────────────────────────────────────────
router.delete(
  "/waiting-list/:proId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const clientId = req.user!.id;
    let proId: number;
    try {
      proId = parseParamToInt(req.params["proId"]);
    } catch {
      res.status(400).json({ success: false, error: "invalid_param" });
      return;
    }

    try {
      const db = getDb();
      await db.execute(
        `DELETE FROM waiting_list WHERE pro_id = ? AND client_id = ?`,
        [proId, clientId]
      );
      res.json({ success: true, message: "Retirée de la liste d'attente." });
    } catch (e) {
      log.error("nail-tech/waiting-list/delete", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── GET /api/client/waiting-list ──────────────────────────────────────────────
router.get(
  "/client/waiting-list",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const clientId = req.user!.id;
    try {
      const db = getDb();
      const [rows] = await db.query(
        `SELECT wl.id, wl.pro_id, wl.prestation_id, wl.preferred_date, wl.note, wl.created_at,
                COALESCE(NULLIF(TRIM(u.activity_name), ''), u.first_name || ' ' || u.last_name) AS pro_name,
                u.profile_photo AS pro_photo,
                p.name AS prestation_name
         FROM waiting_list wl
         JOIN users u ON u.id = wl.pro_id
         LEFT JOIN prestations p ON p.id = wl.prestation_id
         WHERE wl.client_id = ?
         ORDER BY wl.created_at DESC`,
        [clientId]
      );
      res.json({ success: true, data: rows });
    } catch (e) {
      log.error("nail-tech/waiting-list/get", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

/**
 * Called after a slot is freed (cancellation) — notify waiting-list clients for that pro.
 * Only notifies clients who haven't been notified in the last 24h (avoid spam).
 * Exported so it can be called from cancellation.routes.ts.
 */
export async function notifyWaitingList(proId: number, slotDate?: Date): Promise<void> {
  const db = getDb();
  try {
    const [rows] = await db.query(
      `SELECT wl.id, wl.client_id, wl.preferred_date,
              u.first_name
       FROM waiting_list wl
       JOIN users u ON u.id = wl.client_id
       WHERE wl.pro_id = ?
         AND (wl.notified_at IS NULL OR wl.notified_at < NOW() - INTERVAL '24 hours')
       ORDER BY wl.created_at ASC`,
      [proId]
    );

    for (const entry of rows as any[]) {
      // If client has a preferred_date, only notify if the freed slot is on that date
      if (entry.preferred_date && slotDate) {
        const preferred = new Date(entry.preferred_date);
        if (
          preferred.getFullYear() !== slotDate.getFullYear() ||
          preferred.getMonth() !== slotDate.getMonth() ||
          preferred.getDate() !== slotDate.getDate()
        ) {
          continue;
        }
      }

      try {
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'slot_available', 'Créneau disponible', ?, ?)
           RETURNING id, created_at`,
          [
            entry.client_id,
            "Un créneau vient de se libérer ! Réservez vite avant qu'il soit pris.",
            JSON.stringify({ pro_id: proId }),
          ]
        );
        const notif = (notifRows as any[])[0];
        if (notif) {
          await sendNotificationToUser(entry.client_id, {
            id: notif.id,
            type: "slot_available",
            title: "Créneau disponible !",
            message: "Un créneau vient de se libérer ! Réservez vite.",
            data: { pro_id: proId },
            created_at: notif.created_at,
          });
        }
        // Mark as notified
        await db.execute(
          `UPDATE waiting_list SET notified_at = NOW() WHERE id = ?`,
          [entry.id]
        );
      } catch {
        log.warn("nail-tech/waiting-list/notify", "Failed to notify client", { clientId: entry.client_id });
      }
    }
  } catch (e) {
    log.error("nail-tech/waiting-list/notify", errMsg(e), errStack(e));
  }
}

export default router;
