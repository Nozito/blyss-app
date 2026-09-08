import { Response, NextFunction } from "express";
import { getDb } from "../lib/db";
import { AuthenticatedRequest } from "../lib/types";

/**
 * Rollout progressif de la 2FA admin obligatoire (issue #21).
 *
 *   ADMIN_2FA_REQUIRED absent / != "true"  → 2FA optionnelle (comportement
 *     historique : un admin sans TOTP passe).
 *   ADMIN_2FA_REQUIRED = "true"            → sur /api/admin/*, sauf les routes
 *     d'enrôlement, un admin doit avoir totp_enabled = TRUE ET présenter un
 *     token d'accès portant amr:["mfa"] (émis par POST /api/auth/2fa/verify).
 *
 * Voir docs/2FA-admin.md.
 */
export function isAdmin2faRequired(): boolean {
  return process.env.ADMIN_2FA_REQUIRED === "true";
}

/**
 * Routes accessibles à un admin authentifié même sans 2FA active, pour lui
 * permettre de s'enrôler quand ADMIN_2FA_REQUIRED = true. Suffixes (le
 * middleware peut voir `/2fa/setup` ou `/api/admin/2fa/setup` selon le montage).
 */
const ENROLLMENT_PATHS = ["/2fa/setup", "/2fa/confirm"];

function isEnrollmentPath(path: string): boolean {
  return ENROLLMENT_PATHS.some((p) => path === p || path.endsWith(p));
}

/**
 * Middleware: vérifie que l'utilisateur authentifié est admin.
 * Doit être utilisé APRÈS authenticateToken.
 *
 * SECURITY: authoritative check — performs a live DB query each time.
 * Never rely on client-side is_admin for server authorization.
 */
export async function requireAdminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const [rows] = (await getDb().query(
      "SELECT is_admin, totp_enabled FROM users WHERE id = ? AND is_active = TRUE",
      [userId]
    )) as [Array<{ is_admin?: boolean; totp_enabled?: boolean }>, unknown];
    const row = rows[0];
    if (!row?.is_admin) {
      res.status(403).json({ success: false, message: "Accès réservé aux admins" });
      return;
    }

    if (isAdmin2faRequired() && !isEnrollmentPath(req.path)) {
      if (!row.totp_enabled) {
        res.status(403).json({
          success: false,
          error: "2fa_enrollment_required",
          message:
            "La 2FA est obligatoire pour les comptes admin. Enrôle un authenticator via /api/admin/2fa/setup puis /api/admin/2fa/confirm.",
        });
        return;
      }
      if (!req.user?.amr?.includes("mfa")) {
        res.status(401).json({
          success: false,
          error: "mfa_required",
          message: "Second facteur requis — reconnecte-toi avec ton code 2FA.",
        });
        return;
      }
    }

    next();
  } catch {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
