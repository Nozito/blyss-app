import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import { authMiddleware, authenticateToken } from "../middleware/auth";
import { authLoginLimiter, authSignupLimiter, authRefreshLimiter } from "../middleware/rate-limits";
import { getDb } from "../lib/db";
import {
  generateAccessToken,
  generateAndStoreRefreshToken,
  revokeRefreshToken,
} from "../lib/tokens";
import {
  SignupRequestBody,
  LoginRequestBody,
  User,
  AuthenticatedRequest,
} from "../lib/types";

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
          message: "Password too long",
          error: "invalid_password",
        });
      }

      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
        return res.status(400).json({
          success: false,
          message:
            "Password must contain at least one lowercase, one uppercase and one number",
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

      if (phone_number) {
        const cleanPhone = phone_number.replace(/\s/g, "");
        if (!/^[0-9]{10}$/.test(cleanPhone)) {
          return res.status(400).json({
            success: false,
            message: "Invalid phone number format",
            error: "invalid_phone",
          });
        }
      }

      const db = getDb();
      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        const [existing] = (await connection.query(
          "SELECT id FROM users WHERE email = ?",
          [trimmedEmail]
        )) as [any[], any];

        if (existing.length > 0) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message: "Email already exists",
            error: "email_exists",
          });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = (await connection.execute(
          `INSERT INTO users
           (first_name, last_name, email, phone_number, birth_date, password_hash, role, activity_name, city, instagram_account, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            first_name?.trim() || null,
            last_name?.trim() || null,
            trimmedEmail,
            phone_number?.replace(/\s/g, "") || null,
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

        const userId = result.insertId;
        console.log(`✅ User created with ID: ${userId} (${trimmedEmail})`);

        await connection.commit();
        res.json({ success: true, message: "Account created successfully" });
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      }
    } catch (err: any) {
      console.error("❌ Signup error:", err);

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
          error: "email_exists",
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
          activity_name, city, instagram_account, profile_photo, banner_photo,
          bio, profile_visibility, pro_status, bankaccountname, "IBAN",
          iban_iv, iban_tag, iban_last4,
          accept_online_payment, created_at
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
          `SELECT AVG(rating) as avg FROM reviews WHERE pro_id = ?`,
          [userId]
        );
        avg_rating = (ratingRows as any[])[0]?.avg || null;

        const [durationRows] = await db.query(
          `SELECT EXTRACT(YEAR FROM AGE(NOW(), created_at))::int AS years FROM users WHERE id = ?`,
          [userId]
        );
        years_on_blyss = (durationRows as any[])[0]?.years || 0;
      } catch (statsError) {
        console.warn("⚠️ Erreur calcul stats (non bloquant):", statsError);
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
          bankaccountname: user.bankaccountname,
          IBAN: user.IBAN,
          accept_online_payment: user.accept_online_payment,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      console.error("❌ Get profile error:", error);
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
  async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: "missing_fields" });
      }

      const db = getDb();
      const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
      const user = (rows as User[])[0];

      // Réponse identique si user inexistant ou mot de passe incorrect
      // (évite l'énumération d'emails)
      const isValid = user ? await bcrypt.compare(password, user.password_hash) : false;

      if (!user || !isValid) {
        return res
          .status(401)
          .json({ success: false, error: "invalid_credentials" });
      }

      const { password_hash, ...userWithoutPassword } = user;
      const accessToken = generateAccessToken(user.id);
      const refreshToken = await generateAndStoreRefreshToken(user.id);

      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        data: { accessToken, refreshToken, user: userWithoutPassword },
      });
    } catch (err) {
      console.error(err);
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

      const [rows] = await getDb().execute(
        `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token = ? LIMIT 1`,
        [refreshToken]
      );

      const record = (
        rows as { user_id: number; expires_at: Date; revoked: number }[]
      )[0];

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
      console.error("Refresh token error:", err);
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
    console.error("Logout error:", err);
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

      // Supprime l'utilisateur (les autres tables cascadent via FK ON DELETE CASCADE)
      await connection.execute(`DELETE FROM users WHERE id = ?`, [userId]);

      await connection.commit();

      console.log(`✅ RGPD: compte supprimé pour userId=${userId}`);
      clearAuthCookies(res);
      return res.json({ success: true, message: "Compte supprimé avec succès" });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("❌ Delete account error:", err);
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
      const [[users], [reservations], [reviews], [notifications]] = await Promise.all([
        db.query(
          `SELECT id, first_name, last_name, email, phone_number, birth_date, role,
            activity_name, city, bio, profile_visibility, created_at
           FROM users WHERE id = ?`,
          [userId]
        ) as Promise<[any[], any]>,
        db.query(
          `SELECT id, pro_id, prestation_id, start_datetime, end_datetime,
            status, price, notes, created_at
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
      });
    } catch (err) {
      console.error("❌ Export data error:", err);
      return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

export default router;
