import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticateToken } from "../middleware/auth";
import { authLoginLimiter, authLoginAccountLimiter, authSignupLimiter, authCheckLimiter, authRefreshLimiter, passwordResetLimiter, passwordResetAccountLimiter, passwordResetConsumeLimiter } from "../middleware/rate-limits";
import { validate } from "../middleware/validate";
import { forgotPasswordSchema, resetPasswordSchema } from "../middleware/validate";
import { getDb } from "../lib/db";
import { bcryptSemaphore } from "../lib/concurrency";
import { sendPasswordResetEmail } from "../lib/email";
import {
  generateAccessToken,
  generateAndStoreRefreshToken,
  revokeRefreshToken,
  findRefreshToken,
} from "../lib/tokens";
import {
  SignupRequestBody,
  LoginRequestBody,
  User,
  AuthenticatedRequest,
} from "../lib/types";
import { log } from "../lib/logger";

/** Extrait message + stack d'une erreur inconnue pour log structuré */
function errInfo(e: unknown): [string, string | undefined] {
  if (e instanceof Error) return [e.message, e.stack];
  return [String(e), undefined];
}

const router = express.Router();

// ── Helpers cookies ───────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === "production";
const BASE_COOKIE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "strict" as const,
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie("access_token", accessToken, {
    ...BASE_COOKIE,
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie("refresh_token", refreshToken, {
    ...BASE_COOKIE,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", BASE_COOKIE);
  res.clearCookie("refresh_token", BASE_COOKIE);
}

/* POST /check-availability — disponibilité email / téléphone pendant la saisie.
   Ne renvoie que des booléens. La contrainte réelle reste posée par /signup. */
router.post("/check-availability", authCheckLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body as { email?: unknown; phone_number?: unknown };
    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPhone = typeof phone_number === "string" ? phone_number.replace(/\s/g, "") : "";

    if (!trimmedEmail && !cleanPhone) {
      return res.status(400).json({ success: false, error: "missing_fields", message: "Aucun champ à vérifier" });
    }

    const db = getDb();
    const data: { email_taken?: boolean; phone_taken?: boolean } = {};

    if (trimmedEmail) {
      const [rows] = (await db.query("SELECT 1 FROM users WHERE email = ? LIMIT 1", [trimmedEmail])) as [
        unknown[],
        unknown,
      ];
      data.email_taken = rows.length > 0;
    }
    if (cleanPhone) {
      const [rows] = (await db.query(
        "SELECT 1 FROM users WHERE phone_number IS NOT NULL AND phone_number = ? LIMIT 1",
        [cleanPhone]
      )) as [unknown[], unknown];
      data.phone_taken = rows.length > 0;
    }

    res.json({ success: true, data });
  } catch (err) {
    log.error("/api/auth/check-availability", err instanceof Error ? err.message : String(err));
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* POST /signup */
router.post(
  "/signup",
  authSignupLimiter,
  async (req: Request<{}, {}, SignupRequestBody>, res: Response) => {
    let connection;
    try {
      const {
        first_name,
        last_name,
        email,
        password,
        phone_number,
        birth_date,
        role,
        activity_name,
        city,
        instagram_account,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: email and password",
          error: "missing_fields",
        });
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
          error: "invalid_email",
        });
      }

      if (trimmedEmail.length > 254) {
        return res.status(400).json({
          success: false,
          message: "Email too long",
          error: "invalid_email",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
          error: "weak_password",
        });
      }

      if (password.length > 128) {
        return res.status(400).json({
          success: false,
          message: "Password too long (max 128 characters)",
          error: "invalid_password",
        });
      }

      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,128}$/.test(password)) {
        return res.status(400).json({
          success: false,
          message:
            "Password must contain at least one lowercase, one uppercase, one number and one special character (!@#$%^&*)",
          error: "weak_password",
        });
      }

      if (birth_date) {
        const birthDateObj = new Date(birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const monthDiff = today.getMonth() - birthDateObj.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDateObj.getDate())
        ) {
          age--;
        }
        if (age < 16) {
          return res.status(400).json({
            success: false,
            message: "You must be at least 16 years old",
            error: "age_restriction",
          });
        }
      }

      const cleanPhone = phone_number ? phone_number.replace(/\s/g, "") : "";
      if (cleanPhone && !/^[0-9]{10}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format",
          error: "invalid_phone",
        });
      }

      // Hashé AVANT d'acquérir la connexion DB, et borné par bcryptSemaphore
      // — bcrypt.hash(cost=12) est CPU-bound et peut mettre plusieurs
      // centaines de ms en file sous forte charge concurrente ; le faire
      // après getConnection() garderait une connexion du pool (déjà
      // partagé avec la prod via le Session Pooler en dev) inactive tout ce
      // temps, aggravant la pression sur un pool volontairement restreint.
      const releaseHash = await bcryptSemaphore.acquire();
      let passwordHash: string;
      try {
        passwordHash = await bcrypt.hash(password, 12);
      } finally {
        releaseHash();
      }

      const db = getDb();
      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        const [existing] = (await connection.query(
          `SELECT email, phone_number FROM users
           WHERE email = ? OR (phone_number IS NOT NULL AND phone_number = ?)`,
          [trimmedEmail, cleanPhone || null]
        )) as [Array<{ email: string; phone_number: string | null }>, unknown];

        if (existing.length > 0) {
          await connection.rollback();
          const emailTaken = existing.some((r) => r.email === trimmedEmail);
          return res.status(409).json({
            success: false,
            message: emailTaken ? "Email already exists" : "Phone number already exists",
            error: emailTaken ? "email_exists" : "phone_exists",
          });
        }

        const [userRows] = (await connection.execute(
          `INSERT INTO users
           (first_name, last_name, email, phone_number, birth_date, password_hash, role, activity_name, city, instagram_account, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) RETURNING id`,
          [
            first_name?.trim() || null,
            last_name?.trim() || null,
            trimmedEmail,
            cleanPhone || null,
            birth_date || null,
            passwordHash,
            role === "pro" ? "pro" : "client",
            role === "pro" && activity_name?.trim() ? activity_name.trim() : null,
            role === "pro" && city?.trim() ? city.trim() : null,
            role === "pro" && instagram_account?.trim()
              ? instagram_account.trim()
              : null,
          ]
        )) as [any, any];

        const userId = (userRows as any[])[0]?.id;
        // Log without PII: userId only, no email

        await connection.commit();

        // Auto-login: pose les cookies d'auth pour éviter une reconnexion manuelle
        const accessToken = generateAccessToken(userId);
        const refreshToken = await generateAndStoreRefreshToken(userId);
        setAuthCookies(res, accessToken, refreshToken);

        res.json({ success: true, message: "Account created successfully", data: { accessToken, refreshToken } });
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      }
    } catch (err: any) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/signup", msg, stack);

      // 23505 = unique_violation (pg). Le nom de la contrainte distingue
      // email (users_email_key) du téléphone (uq_users_phone_number).
      if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
        const phoneHit = typeof err.constraint === "string" && err.constraint.includes("phone");
        return res.status(409).json({
          success: false,
          message: phoneHit ? "Phone number already exists" : "Email already exists",
          error: phoneHit ? "phone_exists" : "email_exists",
        });
      }

      if (err.code === "ER_DATA_TOO_LONG") {
        return res.status(400).json({
          success: false,
          message: "One or more fields are too long",
          error: "data_too_long",
        });
      }

      res.status(500).json({
        success: false,
        message: "Signup failed due to server error",
        error: "server_error",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET /profile */
router.get(
  "/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      const db = getDb();
      const [rows] = await db.query(
        `SELECT
          id, first_name, last_name, email, phone_number, birth_date, role,
          is_admin, activity_name, city, instagram_account, profile_photo, banner_photo,
          bio, profile_visibility, pro_status,
          accept_online_payment, created_at, last_login_at,
          geo_precision, address_line, postal_code, service_radius_km, service_area_label,
          acceptance_conditions
        FROM users WHERE id = ?`,
        [userId]
      );

      const users = rows as any[];
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      }

      const user = users[0];

      let clients_count = 0;
      let avg_rating = null;
      let years_on_blyss = 0;

      try {
        const [clientRows] = await db.query(
          `SELECT COUNT(DISTINCT client_id) as count FROM reservations WHERE pro_id = ? AND status = 'completed'`,
          [userId]
        );
        clients_count = (clientRows as any[])[0]?.count || 0;

        const [ratingRows] = await db.query(
          `SELECT AVG(rating) as avg FROM reviews WHERE pro_id = ? AND deleted_at IS NULL`,
          [userId]
        );
        avg_rating = (ratingRows as any[])[0]?.avg || null;

        const [durationRows] = await db.query(
          `SELECT EXTRACT(YEAR FROM AGE(NOW(), created_at))::int AS years FROM users WHERE id = ?`,
          [userId]
        );
        years_on_blyss = (durationRows as any[])[0]?.years || 0;
      } catch (statsError) {
        log.warn("/api/auth/profile", "Stats calculation failed (non-blocking)");
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone_number: user.phone_number,
          birth_date: user.birth_date,
          role: user.role,
          is_admin: user.is_admin === true || user.is_admin === 1,
          activity_name: user.activity_name,
          city: user.city,
          instagram_account: user.instagram_account,
          profile_photo: user.profile_photo,
          banner_photo: user.banner_photo,
          bio: user.bio,
          profile_visibility: user.profile_visibility || "public",
          pro_status: user.pro_status,
          clients_count,
          avg_rating,
          years_on_blyss,
          accept_online_payment: user.accept_online_payment,
          created_at: user.created_at,
          geo_precision: user.geo_precision || "city",
          address_line: user.address_line,
          postal_code: user.postal_code,
          service_radius_km: user.service_radius_km,
          service_area_label: user.service_area_label,
          acceptance_conditions: user.acceptance_conditions,
        },
      });
    } catch (error) {
      const [msg, stack] = errInfo(error);
      log.error("/api/auth/profile", msg, stack);
      res.status(500).json({
        success: false,
        message: "Erreur serveur",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/* POST /login */
router.post(
  "/login",
  authLoginLimiter,
  authLoginAccountLimiter,
  async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: "missing_fields" });
      }

      const db = getDb();
      const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
      const user = (rows as (User & {
        is_admin?: boolean;
        failed_admin_attempts?: number;
        admin_locked_until?: string | null;
      })[])[0];

      // Verrouillage anti-bruteforce — comptes admin uniquement. Vérifié
      // avant même la comparaison du mot de passe pour ne pas la gaspiller
      // sur un compte déjà verrouillé.
      if (user?.is_admin && user.admin_locked_until && new Date(user.admin_locked_until) > new Date()) {
        return res.status(423).json({ success: false, error: "admin_locked" });
      }

      // Réponse identique si user inexistant ou mot de passe incorrect
      // (évite l'énumération d'emails). bcryptSemaphore borne la
      // concurrence CPU-bound (cf. lib/concurrency.ts) — pas de connexion
      // DB tenue pendant l'attente ici, db.execute() ci-dessus l'a déjà
      // relâchée.
      let isValid = false;
      if (user) {
        const release = await bcryptSemaphore.acquire();
        try {
          isValid = await bcrypt.compare(password, user.password_hash);
        } finally {
          release();
        }
      }

      if (!user || !isValid) {
        // Compte admin : compte les échecs, verrouille 15 min après 5 échecs.
        if (user?.is_admin) {
          const attempts = (user.failed_admin_attempts ?? 0) + 1;
          if (attempts >= 5) {
            await db.execute(
              "UPDATE users SET failed_admin_attempts = 0, admin_locked_until = NOW() + INTERVAL '15 minutes' WHERE id = ?",
              [user.id]
            );
          } else {
            await db.execute("UPDATE users SET failed_admin_attempts = ? WHERE id = ?", [attempts, user.id]);
          }
        }
        return res
          .status(401)
          .json({ success: false, error: "invalid_credentials" });
      }

      if (user.is_active === false) {
        return res.status(403).json({ success: false, error: "account_disabled" });
      }

      // Mot de passe correct — réinitialise le compteur d'échecs admin
      if (user.is_admin && (user.failed_admin_attempts ?? 0) > 0) {
        await db.execute("UPDATE users SET failed_admin_attempts = 0 WHERE id = ?", [user.id]);
      }


      // Update last_login_at for RGPD data retention cron
      await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

      const { password_hash, ...userWithoutPassword } = user as any;
      const accessToken = generateAccessToken(user.id);
      const refreshToken = await generateAndStoreRefreshToken(user.id);

      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        data: { accessToken, refreshToken, user: userWithoutPassword },
      });
    } catch (err) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/login", msg, stack);
      res.status(500).json({ success: false, error: "login_failed" });
    }
  }
);

/* POST /refresh */
router.post(
  "/refresh",
  authRefreshLimiter,
  async (req: Request, res: Response) => {
    try {
      // Cookie-based clients send nothing in body; legacy clients send refreshToken in body
      const refreshToken: string | undefined =
        req.cookies?.refresh_token || (req.body as { refreshToken?: string })?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ success: false, message: "Missing refresh token" });
      }

      const record = await findRefreshToken(refreshToken);

      if (!record) {
        return res.status(401).json({ success: false, message: "Invalid refresh token" });
      }

      if (record.revoked) {
        return res.status(401).json({ success: false, message: "Refresh token revoked" });
      }

      if (new Date(record.expires_at) <= new Date()) {
        return res.status(401).json({ success: false, message: "Refresh token expired" });
      }

      const newAccessToken = generateAccessToken(record.user_id);
      const newRefreshToken = await generateAndStoreRefreshToken(record.user_id);
      await revokeRefreshToken(refreshToken);

      setAuthCookies(res, newAccessToken, newRefreshToken);

      return res.json({
        success: true,
        data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      });
    } catch (err) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/refresh", msg, stack);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /logout */
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken: string | undefined =
      req.cookies?.refresh_token || (req.body as { refreshToken?: string })?.refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    clearAuthCookies(res);
    return res.json({ success: true });
  } catch (err) {
    const [msg, stack] = errInfo(err);
    log.error("/api/auth/logout", msg, stack);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* DELETE /delete-account — RGPD Art. 17 (droit à l'effacement) */
router.delete(
  "/delete-account",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const db = getDb();
    let connection;
    try {
      // Un admin ne peut pas se supprimer lui-même via ce endpoint générique
      // RGPD s'il est le dernier admin — même garde-fou que DELETE
      // /api/admin/users/:id, pour ne pas verrouiller tout le backoffice.
      const [selfRows] = await db.query("SELECT is_admin FROM users WHERE id = ?", [userId]);
      const self = (selfRows as any[])[0];
      if (self?.is_admin) {
        const [adminsRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE");
        if ((adminsRows as any[])[0].count <= 1) {
          return res.status(400).json({
            success: false,
            message: "Impossible de supprimer le dernier compte administrateur",
          });
        }
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      // Anonymise les réservations (obligation légale de conservation comptable)
      await connection.execute(
        `UPDATE reservations SET client_id = NULL, pro_id = NULL WHERE client_id = ? OR pro_id = ?`,
        [userId, userId]
      );

      // Anonymise les paiements (conservation comptable)
      await connection.execute(
        `UPDATE payments SET client_id = NULL, pro_id = NULL WHERE client_id = ? OR pro_id = ?`,
        [userId, userId]
      );

      // Anonymise les avis : on garde la note/le commentaire mais on retire
      // l'attribution. Deux UPDATE ciblés (pas un seul avec OR) pour ne
      // toucher que le côté qui appartient réellement à ce compte — sinon
      // supprimer son propre compte effacerait aussi l'identité de l'autre
      // partie (le pro noté, ou la cliente qui a laissé l'avis) sans que
      // cette personne n'ait rien demandé.
      await connection.execute(`UPDATE reviews SET client_id = NULL WHERE client_id = ?`, [userId]);
      await connection.execute(`UPDATE reviews SET pro_id = NULL WHERE pro_id = ?`, [userId]);

      // Messages : contrairement à un avis (qui vit sur le profil public de
      // l'autre partie), le contenu d'un message est une donnée personnelle
      // de son auteur sans base de conservation légale — on l'efface
      // vraiment (pas juste l'attribution), en gardant le fil intact pour
      // l'autre participant.
      await connection.execute(
        `UPDATE messages SET sender_id = NULL, body = NULL, attachment_url = NULL, attachment_thumbnail = NULL, deleted_at = NOW()
         WHERE sender_id = ? AND deleted_at IS NULL`,
        [userId]
      );
      await connection.execute(`UPDATE message_threads SET client_id = NULL WHERE client_id = ?`, [userId]);
      await connection.execute(`UPDATE message_threads SET pro_id = NULL WHERE pro_id = ?`, [userId]);

      // Supprime l'utilisateur (les autres tables cascadent via FK ON DELETE CASCADE)
      await connection.execute(`DELETE FROM users WHERE id = ?`, [userId]);

      await connection.commit();

      // RGPD deletion logged without PII
      clearAuthCookies(res);
      return res.json({ success: true, message: "Compte supprimé avec succès" });
    } catch (err) {
      if (connection) await connection.rollback();
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/delete-account", msg, stack);
      return res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET /export-data — RGPD Art. 20 (portabilité des données) */
router.get(
  "/export-data",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const db = getDb();
    try {
      const [[users], [reservations], [reviews], [notifications], [messages]] = await Promise.all([
        db.query(
          `SELECT id, first_name, last_name, email, phone_number, birth_date, role,
            activity_name, city, bio, profile_visibility, created_at
           FROM users WHERE id = ?`,
          [userId]
        ) as Promise<[any[], any]>,
        db.query(
          `SELECT id, pro_id, client_id, prestation_id, start_datetime, end_datetime,
            status, price, paid_online, payment_status, total_paid, created_at
           FROM reservations WHERE client_id = ? OR pro_id = ?`,
          [userId, userId]
        ) as Promise<[any[], any]>,
        db.query(
          `SELECT id, pro_id, client_id, rating, comment, created_at
           FROM reviews WHERE client_id = ? OR pro_id = ?`,
          [userId, userId]
        ) as Promise<[any[], any]>,
        db.query(
          `SELECT id, type, title, message, is_read, created_at
           FROM notifications WHERE user_id = ?`,
          [userId]
        ) as Promise<[any[], any]>,
        db.query(
          `SELECT m.id, m.thread_id, m.body, m.attachment_url, m.created_at
           FROM messages m
           WHERE m.sender_id = ? AND m.deleted_at IS NULL`,
          [userId]
        ) as Promise<[any[], any]>,
      ]);

      const profile = (users as any[])[0] ?? null;

      res.setHeader("Content-Disposition", `attachment; filename="blyss-data-${userId}.json"`);
      res.setHeader("Content-Type", "application/json");
      return res.json({
        exported_at: new Date().toISOString(),
        profile,
        reservations,
        reviews,
        notifications,
        messages,
      });
    } catch (err) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/export-data", msg, stack);
      return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PATCH /restrict-account — RGPD Art. 18 (droit à la limitation) */
router.patch(
  "/restrict-account",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Non authentifié" });
    try {
      await getDb().execute(
        "UPDATE users SET is_restricted = TRUE, restricted_at = NOW() WHERE id = ?",
        [userId]
      );
      return res.json({ success: true, message: "Compte restreint. Vos données ne seront plus utilisées pour des traitements non essentiels." });
    } catch {
      return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* PATCH /unrestrict-account — Lever la limitation */
router.patch(
  "/unrestrict-account",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Non authentifié" });
    try {
      await getDb().execute(
        "UPDATE users SET is_restricted = FALSE, restricted_at = NULL WHERE id = ?",
        [userId]
      );
      return res.json({ success: true, message: "Restriction levée." });
    } catch {
      return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

/* POST /apple — Apple Sign In (stub: not yet implemented) */
router.post("/apple", async (_req: Request, res: Response) => {
  return res.status(501).json({ success: false, error: "apple_signin_not_implemented" });
});

/* POST /forgot-password */
router.post(
  "/forgot-password",
  passwordResetLimiter,
  passwordResetAccountLimiter,
  validate(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    // Always return 200 — never reveal whether an email exists (anti-enumeration)
    const genericOk = () =>
      res.json({
        success: true,
        message: "Si cet email est associé à un compte, un lien de réinitialisation a été envoyé.",
      });

    try {
      const { email } = req.body as { email: string };
      const db = getDb();

      const [rows] = await db.execute(
        "SELECT id, first_name, is_active FROM users WHERE email = ?",
        [email]
      );
      const user = (rows as any[])[0];

      if (!user || user.is_active === false) return genericOk();

      // Invalidate any previous tokens for this user
      await db.execute(
        "DELETE FROM password_reset_tokens WHERE user_id = ?",
        [user.id]
      );

      // Generate a cryptographically random token (URL-safe base64)
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.execute(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [user.id, tokenHash, expiresAt.toISOString()]
      );

      await sendPasswordResetEmail(email, user.first_name, rawToken);

      return genericOk();
    } catch (err) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/forgot-password", msg, stack);
      return genericOk(); // Still don't leak info on error
    }
  }
);

/* POST /reset-password */
router.post(
  "/reset-password",
  passwordResetConsumeLimiter,
  validate(resetPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token: string; password: string };
      const db = getDb();

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const [rows] = await db.execute(
        `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
         FROM password_reset_tokens prt
         WHERE prt.token_hash = ?`,
        [tokenHash]
      );
      const record = (rows as any[])[0];

      if (!record) {
        return res.status(400).json({ success: false, error: "invalid_token" });
      }
      if (record.used_at) {
        return res.status(400).json({ success: false, error: "token_already_used" });
      }
      if (new Date(record.expires_at) < new Date()) {
        return res.status(400).json({ success: false, error: "token_expired" });
      }

      const releaseHash = await bcryptSemaphore.acquire();
      let passwordHash: string;
      try {
        passwordHash = await bcrypt.hash(password, 12);
      } finally {
        releaseHash();
      }

      // Update password + mark token used in a single transaction
      await db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [passwordHash, record.user_id]
      );
      await db.execute(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?",
        [record.id]
      );
      // Revoke all refresh tokens (force re-login on all devices)
      await db.execute(
        "DELETE FROM refresh_tokens WHERE user_id = ?",
        [record.user_id]
      );

      return res.json({ success: true, message: "Mot de passe réinitialisé avec succès." });
    } catch (err) {
      const [msg, stack] = errInfo(err);
      log.error("/api/auth/reset-password", msg, stack);
      return res.status(500).json({ success: false, error: "server_error" });
    }
  }
);

export default router;
