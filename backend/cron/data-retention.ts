/**
 * RGPD Data Retention Cron Job
 * Exécuté 1x par semaine via startDataRetentionCron() depuis server.ts
 *
 * Opérations :
 * 1. Anonymiser les réservations > 5 ans (obligation légale comptable)
 * 2. Envoyer email de préavis 30j avant suppression comptes inactifs > 2 ans 11 mois
 * 3. Supprimer comptes inactifs > 3 ans après préavis
 * 4. Purger les messages (+ pièces jointes) > 3 ans
 * 5. Anonymiser le commentaire des avis > 5 ans (la note est conservée pour
 *    les statistiques du pro)
 * 6. Purger le journal d'audit RGPD lui-même > 12 mois
 * 7. Logger chaque opération dans audit_log
 */

import path from "path";
import fs from "fs";
import { getDb } from "../lib/db";
import { log } from "../lib/logger";

const ROUTE = "/cron/data-retention";

// Même résolution que UPLOADS_DIR dans server.ts, adaptée à la profondeur de
// ce fichier (backend/cron/ au lieu de backend/) : en dev __dirname pointe
// vers backend/cron, en prod vers backend/dist/cron — un niveau de plus
// qu'au niveau racine dans les deux cas.
const UPLOADS_DIR = path.resolve(
  __dirname,
  process.env.NODE_ENV === "production" ? "../../uploads" : "../uploads"
);

function unlinkUploadBestEffort(relUrl: string | null): void {
  if (!relUrl) return;
  const filePath = path.join(UPLOADS_DIR, relUrl.replace(/^\/uploads\//, ""));
  fs.unlink(filePath, () => {}); // best-effort — la ligne DB prime, un fichier orphelin n'est pas bloquant
}

// ── Seuils RGPD ─────────────────────────────────────────────────────────────
const BOOKING_ANONYMIZE_YEARS   = 5;
const ACCOUNT_INACTIVE_MONTHS   = 36; // 3 ans
const ACCOUNT_NOTICE_MONTHS     = 35; // 2 ans 11 mois → email préavis
// Messages : durée alignée sur celle déjà annoncée aux pros pour leurs
// données de compte ("conservées pendant la durée de l'abonnement et 3 ans
// après sa résiliation" — CGV) — cohérence entre les deux politiques.
const MESSAGE_RETENTION_YEARS         = 3;
// Avis : le commentaire libre (texte) est purgé après 5 ans, comme les
// réservations auxquelles il se rapporte ; la note chiffrée reste (nécessaire
// au calcul de la moyenne affichée sur le profil du pro).
const REVIEW_COMMENT_ANONYMIZE_YEARS  = 5;
// Journal d'audit RGPD lui-même : recommandation CNIL pour les logs
// techniques/opérationnels (hors obligation légale spécifique) — 12 mois.
const AUDIT_LOG_RETENTION_MONTHS      = 12;

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
/**
 * Efface les fichiers photo (profil, bannière, portfolio) d'un utilisateur
 * sur le disque. Ne touche jamais les lignes DB : appelée avant un DELETE
 * (dont le CASCADE sur gallery_images videra les lignes) ou avant un
 * UPDATE d'anonymisation (dont le DELETE explicite des lignes suit juste
 * après) — dans les deux cas, sans cet appel les fichiers restent orphelins
 * sur disque et accessibles par URL directe indéfiniment.
 */
async function unlinkUserPhotoFiles(userId: number): Promise<void> {
  const [photoRows] = await getDb().query(
    `SELECT profile_photo, banner_photo FROM users WHERE id = ?`,
    [userId]
  );
  const photos = (photoRows as Array<{ profile_photo: string | null; banner_photo: string | null }>)[0];
  if (photos) {
    unlinkUploadBestEffort(photos.profile_photo);
    unlinkUploadBestEffort(photos.banner_photo);
  }

  const [galleryRows] = await getDb().query(
    `SELECT url, thumbnail FROM gallery_images WHERE pro_id = ?`,
    [userId]
  );
  for (const g of galleryRows as Array<{ url: string; thumbnail: string }>) {
    unlinkUploadBestEffort(g.url);
    unlinkUploadBestEffort(g.thumbnail);
  }
}

async function anonymizeUser(userId: number): Promise<void> {
  // profile_photo/banner_photo/gallery_images ne sont référencées que par
  // cette ligne — les blanchir en DB sans effacer le fichier physique
  // laisse le portrait/portfolio de la personne accessible indéfiniment
  // par URL directe. On les efface avant l'UPDATE ci-dessous.
  await unlinkUserPhotoFiles(userId);
  // Le compte survit (anonymisation, pas suppression) : contrairement au
  // DELETE FROM users, il n'y a pas de CASCADE pour vider gallery_images.
  await getDb().execute(`DELETE FROM gallery_images WHERE pro_id = ?`, [userId]);

  // The row survives (FK-blocked DELETE fallback), so every PII column that
  // exists on `users` must be blanked here — not just the ones the delete-
  // account flow happens to touch first. Past audit found this list missing
  // address/geo/Stripe IDs, leaving exact location + payment identifiers on
  // "deleted" inactive accounts indefinitely.
  await getDb().execute(
    `UPDATE users SET
       first_name = 'Compte', last_name = 'supprimé',
       email = 'deleted-' || id || '@blyss-anonymized.invalid',
       phone_number = NULL, birth_date = NULL,
       activity_name = NULL, city = NULL, instagram_account = NULL,
       profile_photo = NULL, banner_photo = NULL, bio = NULL,
       address_line = NULL, postal_code = NULL,
       latitude = NULL, longitude = NULL,
       public_latitude = NULL, public_longitude = NULL,
       service_area_label = NULL,
       stripe_customer_id = NULL, stripe_account_id = NULL,
       is_active = FALSE
     WHERE id = ?`,
    [userId]
  );
  // payment_methods carries last4/cardholder_name — not covered by any FK
  // cascade off `users`, so it survives an anonymize-in-place just like the
  // address/geo columns did until this fix.
  await getDb().execute(`DELETE FROM payment_methods WHERE user_id = ?`, [userId]);
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
      // Effacée avant la tentative de DELETE : si elle réussit, le CASCADE
      // videra gallery_images mais ne touchera jamais le disque — sans quoi
      // les fichiers deviennent orphelins et restent servis indéfiniment.
      await unlinkUserPhotoFiles(id);
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

/**
 * Purge définitive des messages (chat client↔pro) et de leurs pièces
 * jointes au-delà de MESSAGE_RETENTION_YEARS. Suppression physique (pas de
 * soft delete ici — celui-ci sert la modération, pas la rétention) : les
 * fichiers sont effacés avant les lignes pour ne jamais laisser un fichier
 * référencé par une ligne déjà supprimée.
 */
async function purgeOldMessages(): Promise<number> {
  const [rows] = await getDb().query(
    `SELECT id, attachment_url, attachment_thumbnail
     FROM messages
     WHERE created_at < NOW() - INTERVAL '${MESSAGE_RETENTION_YEARS} years'`,
    []
  );
  const messages = rows as Array<{ id: number; attachment_url: string | null; attachment_thumbnail: string | null }>;
  if (messages.length === 0) return 0;

  for (const m of messages) {
    unlinkUploadBestEffort(m.attachment_url);
    unlinkUploadBestEffort(m.attachment_thumbnail);
  }

  const ids = messages.map((m) => m.id);
  const [result] = await getDb().execute(
    `DELETE FROM messages WHERE id = ANY(?)`,
    [ids]
  );
  return (result as any).rowCount ?? messages.length;
}

/**
 * Anonymise le commentaire libre des avis au-delà de
 * REVIEW_COMMENT_ANONYMIZE_YEARS — la note (rating) reste, nécessaire au
 * calcul de la moyenne affichée sur le profil du pro.
 */
async function anonymizeOldReviewComments(): Promise<number> {
  const [result] = await getDb().execute(
    `UPDATE reviews SET comment = NULL
     WHERE comment IS NOT NULL
       AND created_at < NOW() - INTERVAL '${REVIEW_COMMENT_ANONYMIZE_YEARS} years'`,
    []
  );
  return (result as any).rowCount ?? 0;
}

/**
 * Purge le journal d'audit RGPD lui-même au-delà de
 * AUDIT_LOG_RETENTION_MONTHS — sans quoi cette table grandit indéfiniment.
 */
async function purgeOldAuditLogs(): Promise<number> {
  const [result] = await getDb().execute(
    `DELETE FROM audit_log WHERE executed_at < NOW() - INTERVAL '${AUDIT_LOG_RETENTION_MONTHS} months'`,
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
    const purged = await purgeOldMessages();
    await logAudit("purge_old_messages", purged);
    log.warn(ROUTE, `Purged ${purged} message(s) older than ${MESSAGE_RETENTION_YEARS} years`);
  } catch (err: unknown) {
    log.error(ROUTE, "purge_old_messages failed", err instanceof Error ? err.stack : String(err));
  }

  try {
    const anonymized = await anonymizeOldReviewComments();
    await logAudit("anonymize_old_review_comments", anonymized);
    log.warn(ROUTE, `Anonymized ${anonymized} review comment(s) older than ${REVIEW_COMMENT_ANONYMIZE_YEARS} years`);
  } catch (err: unknown) {
    log.error(ROUTE, "anonymize_old_review_comments failed", err instanceof Error ? err.stack : String(err));
  }

  try {
    const purged = await purgeOldAuditLogs();
    await logAudit("purge_old_audit_logs", purged);
    log.warn(ROUTE, `Purged ${purged} audit_log entries older than ${AUDIT_LOG_RETENTION_MONTHS} months`);
  } catch (err: unknown) {
    log.error(ROUTE, "purge_old_audit_logs failed", err instanceof Error ? err.stack : String(err));
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
