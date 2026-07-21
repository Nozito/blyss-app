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

/**
 * Blanks out PII while keeping the row (and its id) intact. Used when a hard
 * DELETE is blocked by FK constraints (reservations/payments/reviews have no
 * ON DELETE CASCADE from users — by design, those need to survive for
 * accounting/legal retention). is_active=FALSE is the same gate already used
 * by the admin ban action, so the account becomes unusable the same way.
 */
async function anonymizeUser(userId: number): Promise<void> {
  await getDb().execute(
    `UPDATE users SET
       first_name = 'Compte', last_name = 'supprimé',
       email = 'deleted-' || id || '@blyss-anonymized.invalid',
       phone_number = NULL, birth_date = NULL,
       activity_name = NULL, city = NULL, instagram_account = NULL,
       profile_photo = NULL, banner_photo = NULL, bio = NULL,
       "IBAN" = NULL, iban_iv = NULL, iban_tag = NULL, iban_hash = NULL, iban_last4 = NULL,
       bankaccountname = NULL,
       is_active = FALSE
     WHERE id = ?`,
    [userId]
  );
}

/**
 * Deletes (or anonymizes, as a fallback) accounts inactive for
 * ACCOUNT_INACTIVE_MONTHS that already received the 30-day notice.
 *
 * Processed one user at a time rather than as a single bulk DELETE: a bulk
 * statement is atomic, so a single user with reservation/payment/review
 * history (no ON DELETE CASCADE on those FKs) would abort the entire batch —
 * meaning zero accounts get deleted that cycle, silently, every cycle,
 * for as long as that one row keeps matching the WHERE clause. Handling
 * each user independently means one FK conflict no longer blocks the rest,
 * and falls back to anonymization so the RGPD erasure obligation is still
 * met for accounts with history instead of being silently skipped.
 */
async function deleteInactiveAccounts(): Promise<{ deleted: number; anonymized: number; failed: number }> {
  const [rows] = await getDb().query(
    `SELECT id FROM users
     WHERE last_login_at < NOW() - INTERVAL '${ACCOUNT_INACTIVE_MONTHS} months'
       AND retention_notice_sent_at IS NOT NULL
       AND retention_notice_sent_at < NOW() - INTERVAL '30 days'
       AND is_admin = FALSE`,
    []
  );
  const candidates = rows as { id: number }[];

  let deleted = 0;
  let anonymized = 0;
  let failed = 0;

  for (const { id } of candidates) {
    try {
      await getDb().execute(`DELETE FROM users WHERE id = ?`, [id]);
      deleted++;
    } catch {
      // Most likely a FK violation from reservation/payment/review history.
      try {
        await anonymizeUser(id);
        anonymized++;
      } catch (anonErr) {
        failed++;
        log.error(
          ROUTE,
          `Could not delete or anonymize user ${id}`,
          anonErr instanceof Error ? anonErr.stack : String(anonErr)
        );
      }
    }
  }

  return { deleted, anonymized, failed };
}

async function purgeRevokedInstagramTokens(): Promise<number> {
  // Table is instagram_connections (not instagram_tokens); revoked rows have is_active = FALSE
  const [result] = await getDb().execute(
    `DELETE FROM instagram_connections
     WHERE is_active = FALSE
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
    const { deleted, anonymized, failed } = await deleteInactiveAccounts();
    await logAudit("delete_inactive_accounts", deleted + anonymized);
    log.warn(ROUTE, `Deleted ${deleted}, anonymized ${anonymized}, failed ${failed} inactive account(s)`);
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
