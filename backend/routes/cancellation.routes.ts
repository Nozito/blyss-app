/**
 * Routes de politique d'annulation.
 *
 * PATCH /api/pro/settings/cancellation-policy  — pro met à jour son délai
 * GET   /api/pro/settings/cancellation-policy  — pro lit son délai
 * POST  /api/reservations/:id/cancel           — client annule un RDV
 *
 * SECURITY: La vérification du délai se fait UNIQUEMENT côté serveur.
 * Aucune donnée cliente ne détermine si l'annulation est autorisée.
 */

import express, { Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate, cancellationPolicySchema } from "../middleware/validate";
import { cancellationLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import {
  canCancelAppointment,
  getCancellationDeadline,
  CancellationWindowExpiredError,
} from "../lib/cancellation";
import { sendNotificationToUser } from "../lib/notifications";
import { parseParamToInt } from "../lib/helpers";
import type { AuthenticatedRequest } from "../lib/types";

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function errStack(e: unknown): string | undefined {
  return e instanceof Error ? e.stack : undefined;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── PATCH /api/pro/settings/cancellation-policy ───────────────────────────

/**
 * Le professionnel configure son délai minimum d'annulation.
 * Requiert : rôle = 'pro', valeur dans ALLOWED_NOTICE_HOURS.
 */
router.patch(
  "/pro/settings/cancellation-policy",
  authMiddleware,
  validate(cancellationPolicySchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.id;

    try {
      const db = getDb();

      // Vérification rôle depuis la base — cohérent avec le pattern existant
      const [userRows] = await db.query(
        `SELECT role FROM users WHERE id = ?`,
        [userId]
      );
      const users = userRows as Array<{ role: string }>;
      if (users.length === 0 || users[0].role !== "pro") {
        res.status(403).json({
          success: false,
          error: "forbidden",
          message: "Accès réservé aux professionnels.",
        });
        return;
      }

      const { cancellation_notice_hours } = req.body as { cancellation_notice_hours: number };

      await db.query(
        `UPDATE users SET cancellation_notice_hours = ? WHERE id = ?`,
        [cancellation_notice_hours, userId]
      );

      log.warn("cancellation-policy/update", "policy updated", {
        proId: userId,
        hours: cancellation_notice_hours,
      });

      res.json({
        success: true,
        cancellation_notice_hours,
        message:
          cancellation_notice_hours === 0
            ? "Annulation autorisée à tout moment."
            : `Annulation possible jusqu'à ${cancellation_notice_hours}h avant le RDV.`,
      });
    } catch (e) {
      log.error("cancellation-policy/update", errMsg(e), errStack(e));
      res.status(500).json({
        success: false,
        error: "internal_error",
        message: "Erreur lors de la mise à jour de la politique d'annulation.",
      });
    }
  }
);

// ── GET /api/pro/settings/cancellation-policy ─────────────────────────────

/**
 * Lecture du délai configuré (pro uniquement).
 */
router.get(
  "/pro/settings/cancellation-policy",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.id;
    try {
      const db = getDb();
      const [rows] = await db.query(
        `SELECT role, cancellation_notice_hours FROM users WHERE id = ?`,
        [userId]
      );
      const users = rows as Array<{ role: string; cancellation_notice_hours: number }>;
      if (users.length === 0) {
        res.status(404).json({ success: false, error: "not_found" });
        return;
      }
      if (users[0].role !== "pro") {
        res.status(403).json({ success: false, error: "forbidden" });
        return;
      }
      res.json({
        success: true,
        cancellation_notice_hours: users[0].cancellation_notice_hours,
      });
    } catch (e) {
      log.error("cancellation-policy/read", errMsg(e), errStack(e));
      res.status(500).json({ success: false, error: "internal_error" });
    }
  }
);

// ── POST /api/reservations/:id/cancel ─────────────────────────────────────

/**
 * Le client annule sa réservation.
 *
 * Vérifications côté serveur (jamais déléguées au client) :
 *   1. L'id est un entier valide.
 *   2. La réservation appartient bien au client authentifié.
 *   3. Le statut est 'confirmed' ou 'pending'.
 *   4. L'heure actuelle est strictement avant la deadline d'annulation.
 *
 * Effets : status → 'cancelled', slot libéré, notification au pro.
 *
 * ARCHITECTURE NOTE: Les mises à jour (reservations + slots) sont des
 * requêtes séquentielles sans transaction. La libération du slot est
 * non-critique en cas d'échec isolé (un cron de reconciliation peut
 * corriger). Pour un fort volume, préférer une transaction explicite.
 */
router.post(
  "/reservations/:id/cancel",
  authMiddleware,
  cancellationLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const clientId = req.user!.id;

    // ── Validation de l'ID de route
    let reservationId: number;
    try {
      reservationId = parseParamToInt(req.params["id"]);
    } catch {
      res.status(400).json({
        success: false,
        error: "invalid_param",
        message: "Identifiant de réservation invalide.",
      });
      return;
    }

    try {
      const db = getDb();

      // ── 1. Charger la réservation + la politique du pro en une seule requête
      const [rows] = await db.query(
        `SELECT r.id, r.client_id, r.pro_id, r.status,
                r.start_datetime, r.slot_id,
                u.cancellation_notice_hours
         FROM reservations r
         JOIN users u ON u.id = r.pro_id
         WHERE r.id = ?`,
        [reservationId]
      );

      const reservations = rows as Array<{
        id: number;
        client_id: number;
        pro_id: number;
        status: string;
        start_datetime: Date | string;
        slot_id: number | null;
        cancellation_notice_hours: number;
      }>;

      if (reservations.length === 0) {
        res.status(404).json({
          success: false,
          error: "not_found",
          message: "Réservation introuvable.",
        });
        return;
      }

      const reservation = reservations[0];

      // ── 2. Vérification propriété — IDOR prevention
      // Réponse identique au 404 pour ne pas révéler l'existence du RDV
      if (reservation.client_id !== clientId) {
        res.status(404).json({
          success: false,
          error: "not_found",
          message: "Réservation introuvable.",
        });
        return;
      }

      // ── 3. Vérification statut
      if (reservation.status !== "confirmed" && reservation.status !== "pending") {
        res.status(409).json({
          success: false,
          error: "invalid_status",
          message:
            reservation.status === "cancelled"
              ? "Cette réservation est déjà annulée."
              : "Cette réservation ne peut plus être annulée.",
        });
        return;
      }

      // ── 4. Vérification délai — UNIQUEMENT côté serveur
      const startAt =
        reservation.start_datetime instanceof Date
          ? reservation.start_datetime
          : new Date(reservation.start_datetime as string);

      const noticeHours = reservation.cancellation_notice_hours;
      const deadline = getCancellationDeadline(startAt, noticeHours);

      if (!canCancelAppointment(startAt, noticeHours)) {
        throw new CancellationWindowExpiredError(deadline);
      }

      // ── 5. Annulation en base
      await db.query(
        `UPDATE reservations SET status = 'cancelled' WHERE id = ?`,
        [reservationId]
      );

      if (reservation.slot_id !== null) {
        await db.query(
          `UPDATE slots SET status = 'available' WHERE id = ? AND status = 'booked'`,
          [reservation.slot_id]
        );
      }

      // ── 6. Notification au professionnel (best-effort)
      try {
        const [notifRows] = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'booking_cancelled', 'RDV annulé', ?, ?)
           RETURNING id, created_at`,
          [
            reservation.pro_id,
            `Un client a annulé son rendez-vous du ${startAt.toLocaleDateString("fr-FR")}.`,
            JSON.stringify({ reservation_id: reservationId }),
          ]
        );
        const notifList = notifRows as Array<{ id: number; created_at: string }>;
        if (notifList.length > 0) {
          await sendNotificationToUser(reservation.pro_id, {
            id: notifList[0].id,
            type: "booking_cancelled",
            title: "RDV annulé",
            message: `Un client a annulé son rendez-vous du ${startAt.toLocaleDateString("fr-FR")}.`,
            data: { reservation_id: reservationId },
            created_at: notifList[0].created_at,
          });
        }
      } catch (notifErr) {
        log.warn("reservations/cancel", "notification failed (non-fatal)", {
          reservationId,
          msg: errMsg(notifErr),
        });
      }

      log.warn("reservations/cancel", "cancellation successful", {
        reservationId,
        clientId,
        proId: reservation.pro_id,
      });

      res.json({
        success: true,
        message: "Réservation annulée avec succès.",
        reservation_id: reservationId,
      });
    } catch (e) {
      if (e instanceof CancellationWindowExpiredError) {
        res.status(422).json({
          success: false,
          error: e.code,
          message: e.message,
          deadline: e.deadline.toISOString(),
        });
        return;
      }

      log.error("reservations/cancel", errMsg(e), errStack(e));
      res.status(500).json({
        success: false,
        error: "internal_error",
        message: "Erreur lors de l'annulation.",
      });
    }
  }
);

export default router;
