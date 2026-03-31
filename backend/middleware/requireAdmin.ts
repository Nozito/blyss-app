import { Response, NextFunction } from "express";
import { getDb } from "../lib/db";
import { AuthenticatedRequest } from "../lib/types";

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
    const [rows] = await getDb().query(
      "SELECT is_admin FROM users WHERE id = ? AND is_active = TRUE",
      [userId]
    );
    if (!(rows as any[])[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Accès réservé aux admins" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
