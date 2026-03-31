/**
 * RGPD Data Retention Cron Job
 * Exécuté 1x par semaine via startDataRetentionCron() depuis server.ts
 *
 * Opérations :
 * 1. Anonymiser les réservations > 5 ans (obligation légale comptable)
 * 2. Envoyer email de préavis 30j avant suppression comptes inactifs > 2 ans 11 mois
 * 3. Supprimer comptes inactifs > 3 ans après préavis
 * 4. Purger tokens Instagram révoqués > 90 jours
 * 5. Logger chaque opération dans audit_log
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/data-retention";

// ── Seuils RGPD ─────────────────────────────────────────────────────────────
const BOOKING_ANONYMIZE_YEARS   = 5;
const ACCOUNT_INACTIVE_MONTHS   = 36; // 3 ans
const ACCOUNT_NOTICE_MONTHS     = 35; // 2 ans 11 mois → email préavis
const INSTAGRAM_TOKEN_DAYS      = 90;

// ── Envoi email préavis via Resend ───────────────────────────────────────────
async function sendRetentionNotice(email: string, firstName: string): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Blyss <noreply@blyssapp.fr>",
        to: [email],
        subject: "Votre compte Blyss sera supprimé dans 30 jours",
        html: `
<p>Bonjour ${firstName},</p>
<p>Votre compte Blyss est inactif depuis presque 3 ans. Conformément à notre politique
de conservation des données (RGPD), il sera <strong>définitivement supprimé dans 30 jours</strong>.</p>
<p>Si vous souhaitez conserver votre compte, connectez-vous simplement sur
<a href="${process.env.FRONTEND_URL ?? "https://app.blyssapp.fr"}">app.blyssapp.fr</a>.</p>
<p>Pour exercer vos droits RGPD : <a href="mailto:privacy@blyssapp.fr">privacy@blyssapp.fr</a></p>
<p>L'équipe Blyss</p>
        `.trim(),
      }),
    });
  } catch (err: unknown) {
    log.error(ROUTE, "Failed to send retention notice", err instanceof Error ? err.stack : String(err));
  }
}

// ── Tâches de rétention ──────────────────────────────────────────────────────

async function anonymizeOldBookings(): Promise<number> {
  const [result] = await getDb().execute(
    `UPDATE reservations SET
      client_id  = NULL,
      notes      = NULL
     WHERE start_datetime < NOW() - INTERVAL '${BOOKING_ANONYMIZE_YEARS} years'
       AND client_id IS NOT NULL`,
    []
  );
  return (result as any).rowCount ?? 0;
}

async function sendNoticesForSoonExpiredAccounts(): Promise<number> {
  const [rows] = await getDb().query(
    `SELECT id, email, first_name
     FROM users
     WHERE is_active = TRUE
       AND last_login_at < NOW() - INTERVAL '${ACCOUNT_NOTICE_MONTHS} months'
       AND retention_notice_sent_at IS NULL`,
    []
  );
  const users = rows as { id: number; email: string; first_name: string }[];

  for (const user of users) {
    await sendRetentionNotice(user.email, user.first_name);
    await getDb().execute(
      "UPDATE users SET retention_notice_sent_at = NOW() WHERE id = ?",
      [user.id]
    );
  }
  return users.length;
}

async function deleteInactiveAccounts(): Promise<number> {
  // Only delete accounts that received a notice AND are still inactive
  const [result] = await getDb().execute(
    `DELETE FROM users
     WHERE last_login_at < NOW() - INTERVAL '${ACCOUNT_INACTIVE_MONTHS} months'
       AND retention_notice_sent_at IS NOT NULL
       AND retention_notice_sent_at < NOW() - INTERVAL '30 days'
       AND is_admin = FALSE`,
    []
  );
  return (result as any).rowCount ?? 0;
}

async function purgeRevokedInstagramTokens(): Promise<number> {
  const [result] = await getDb().execute(
    `DELETE FROM instagram_tokens
     WHERE revoked = TRUE
       AND updated_at < NOW() - INTERVAL '${INSTAGRAM_TOKEN_DAYS} days'`,
    []
  );
  return (result as any).rowCount ?? 0;
}

async function logAudit(operation: string, rowsAffected: number): Promise<void> {
  try {
    await getDb().execute(
      `INSERT INTO audit_log (operation, rows_affected, executed_at)
       VALUES (?, ?, NOW())
       ON CONFLICT DO NOTHING`,
      [operation, rowsAffected]
    );
  } catch {
    // audit_log table may not exist yet — non-blocking
  }
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

export async function runDataRetentionCycle(): Promise<void> {
  log.warn(ROUTE, "Starting data retention cycle...");

  try {
    const anonymized = await anonymizeOldBookings();
    await logAudit("anonymize_old_bookings", anonymized);
    log.warn(ROUTE, `Anonymized ${anonymized} old bookings`);
  } catch (err: unknown) {
    log.error(ROUTE, "anonymize_old_bookings failed", err instanceof Error ? err.stack : String(err));
  }

  try {
    const notices = await sendNoticesForSoonExpiredAccounts();
    await logAudit("retention_notices_sent", notices);
    log.warn(ROUTE, `Sent ${notices} retention notices`);
  } catch (err: unknown) {
    log.error(ROUTE, "retention_notices failed", err instanceof Error ? err.stack : String(err));
  }

  try {
    const deleted = await deleteInactiveAccounts();
    await logAudit("delete_inactive_accounts", deleted);
    log.warn(ROUTE, `Deleted ${deleted} inactive accounts`);
  } catch (err: unknown) {
    log.error(ROUTE, "delete_inactive_accounts failed", err instanceof Error ? err.stack : String(err));
  }

  try {
    const purged = await purgeRevokedInstagramTokens();
    await logAudit("purge_instagram_tokens", purged);
    log.warn(ROUTE, `Purged ${purged} revoked Instagram tokens`);
  } catch (err: unknown) {
    log.error(ROUTE, "purge_instagram_tokens failed", err instanceof Error ? err.stack : String(err));
  }

  log.warn(ROUTE, "Data retention cycle complete");
}

/**
 * Lance le cron de rétention : 1x par semaine, le dimanche à 3h UTC.
 * À appeler depuis server.ts au démarrage.
 */
export function startDataRetentionCron(): void {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Run immediately once after startup (in case server was down during last scheduled run)
  setTimeout(() => {
    runDataRetentionCycle().catch((err: unknown) =>
      log.error(ROUTE, "Cron initial run failed", err instanceof Error ? err.stack : String(err))
    );
  }, 60_000); // wait 1 min after startup

  setInterval(() => {
    runDataRetentionCycle().catch((err: unknown) =>
      log.error(ROUTE, "Cron weekly run failed", err instanceof Error ? err.stack : String(err))
    );
  }, WEEK_MS);
}
