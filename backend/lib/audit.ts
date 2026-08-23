import { Request } from "express";
import { getDb } from "./db";

/**
 * Journalise une action admin sensible (grant/revoke admin, suppression
 * utilisateur, remboursement...). Best-effort : une erreur d'écriture ne
 * doit jamais faire échouer l'action métier elle-même.
 */
export async function logAdminAction(
  req: Request,
  actorId: number,
  action: string,
  targetType?: string,
  targetId?: string | number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    await getDb().query(
      `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, metadata, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, action, targetType || null, targetId != null ? String(targetId) : null, metadata ? JSON.stringify(metadata) : null, ip]
    );
  } catch (error) {
    console.error("[AUDIT] Failed to write admin_audit_log:", error);
  }
}
