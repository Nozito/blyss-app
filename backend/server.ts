import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { isValidIBAN, electronicFormatIBAN } from "ibantools";
import crypto from "crypto";

const envFile = process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
const envPath = path.resolve(__dirname, "..", envFile);
console.log("Loading env from:", envPath);

dotenv.config({ path: envPath });

console.log("JWT_SECRET after dotenv =", process.env.JWT_SECRET);

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not defined. Exiting.");
  process.exit(1);
}

interface AuthenticatedRequest extends Request {
  user?: { id: number };
  file?: Express.Multer.File;
}

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8080",
  "https://app.blyssapp.fr",
];

const IBAN_KEY = Buffer.from(process.env.IBAN_ENC_KEY || "", "hex");
const IBAN_IV = Buffer.from(process.env.IBAN_ENC_IV || "", "hex");

if (IBAN_KEY.length !== 32) {
  console.error("IBAN_ENC_KEY must be 32 bytes (64 hex chars).");
  process.exit(1);
}
if (![12, 16].includes(IBAN_IV.length)) {
  console.error("IBAN_ENC_IV must be 12 or 16 bytes.");
  process.exit(1);
}

// Renomme la fonction pour être plus générique
function encryptSensitiveData(plain: string): string {
  if (!plain || plain.trim() === '') {
    return '';
  }
  const cipher = crypto.createCipheriv("aes-256-gcm", IBAN_KEY, IBAN_IV);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

function decryptSensitiveData(stored: string): string {
  if (!stored || stored.trim() === '') {
    return '';
  }
  const [cipherTextB64, tagB64] = stored.split(":");
  if (!cipherTextB64 || !tagB64) {
    throw new Error("Invalid encrypted data format");
  }
  const encrypted = Buffer.from(cipherTextB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", IBAN_KEY, IBAN_IV);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// Garde les alias pour compatibilité
const encryptIban = encryptSensitiveData;
const decryptIban = decryptSensitiveData;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  console.log("Auth header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    console.log("JWT incoming:", token.substring(0, 30));
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    console.log("JWT decoded id:", decoded.id);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    console.error("JWT error:", err);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

interface SignupRequestBody {
  first_name?: string;
  last_name?: string;
  email: string;
  password: string;
  phone_number?: string;
  birth_date?: string;
  role?: string;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  birth_date: string | null;
  password_hash: string;
  role: string;
  activity_name: string | null;
  city: string | null;
  instagram_account: string | null;
  profile_photo: string | null;
  pro_status?: "active" | "inactive" | null;
  IBAN?: string | null;
  bankaccountname?: string | null;
}

interface UpdatePaymentsBody {
  bankaccountname?: string;
  IBAN?: string;
  accept_online_payment?: boolean;
}

interface CreateSubscriptionBody {
  plan: "start" | "serenite" | "signature";
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice?: number | null;
  commitmentMonths?: number | null;
  startDate: string;
  endDate?: string | null;
}

function generateAccessToken(userId: number) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

async function generateAndStoreRefreshToken(userId: number) {
  const refreshToken = crypto.randomBytes(64).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.execute(
    `
      INSERT INTO refresh_tokens (user_id, token, expires_at, revoked)
      VALUES (?, ?, ?, 0)
    `,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
}

async function revokeRefreshToken(token: string) {
  await db.execute(
    `
      UPDATE refresh_tokens
      SET revoked = 1
      WHERE token = ?
    `,
    [token]
  );
}

/* AUTH SIGNUP */
app.post(
  "/api/auth/signup",
  async (req: Request<{}, {}, SignupRequestBody>, res: Response) => {
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
        });
      }

      const password_hash = await bcrypt.hash(password, 12);

      await db.execute(
        `INSERT INTO users
         (first_name, last_name, email, phone_number, birth_date, password_hash, role, activity_name, city, instagram_account)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          first_name || null,
          last_name || null,
          email,
          phone_number || null,
          birth_date || null,
          password_hash,
          role || "client",
          role === "pro" ? activity_name : null,
          role === "pro" ? city : null,
          role === "pro" ? instagram_account : null,
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Signup failed due to server error" });
    }
  }
);

/* AUTH LOGIN */
app.post(
  "/api/auth/login",
  async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: "missing_fields" });
      }

      const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [
        email,
      ]);
      const user = (rows as User[])[0];

      if (!user) {
        return res.status(404).json({ success: false, error: "user_not_found" });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ success: false, error: "invalid_password" });
      }

      const { password_hash, ...userWithoutPassword } = user;

      const accessToken = generateAccessToken(user.id);
      const refreshToken = await generateAndStoreRefreshToken(user.id);

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: userWithoutPassword,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "login_failed" });
    }
  }
);

/* AUTH REFRESH */
app.post("/api/auth/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing refresh token" });
    }

    const [rows] = await db.execute(
      `
        SELECT user_id, expires_at, revoked
        FROM refresh_tokens
        WHERE token = ?
        LIMIT 1
      `,
      [refreshToken]
    );

    const record =
      (rows as { user_id: number; expires_at: Date; revoked: number }[])[0];

    if (!record) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    if (record.revoked) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token revoked" });
    }

    const now = new Date();
    const expiresAt = new Date(record.expires_at);
    if (expiresAt <= now) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const newAccessToken = generateAccessToken(record.user_id);
    const newRefreshToken = await generateAndStoreRefreshToken(record.user_id);
    await revokeRefreshToken(refreshToken);

    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* AUTH LOGOUT */
app.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing refresh token" });
    }

    await revokeRefreshToken(refreshToken);

    return res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* GET CURRENT USER + STATS */
app.get(
  "/api/users",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Récupère l'utilisateur
      const [userRows] = await db.execute("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);
      const user = (userRows as User[])[0];
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      // Déchiffre les données bancaires si elles existent
      let decryptedBankData: any = {};
      if (user.IBAN) {
        try {
          const plainIban = decryptSensitiveData(user.IBAN as string);
          decryptedBankData.IBAN = plainIban.replace(/.(?=.{4})/g, "•"); // Masqué
        } catch (err) {
          console.error("Error decrypting IBAN:", err);
          decryptedBankData.IBAN = null;
        }
      }

      if (user.bankaccountname) {
        try {
          decryptedBankData.bankaccountname = decryptSensitiveData(
            user.bankaccountname as string
          );
        } catch (err) {
          console.error("Error decrypting bank account name:", err);
          decryptedBankData.bankaccountname = null;
        }
      }

      // Nombre de clients distincts
      const [clientsRows] = await db.execute(
        `
        SELECT COUNT(DISTINCT client_id) AS clients_count
        FROM reservations
        WHERE pro_id = ?
          AND status = 'completed'
        `,
        [userId]
      );
      const clients_count = Number(
        (clientsRows as any[])[0]?.clients_count ?? 0
      );

      // Note moyenne
      const [ratingRows] = await db.execute(
        `
        SELECT AVG(rating) AS avg_rating
        FROM reviews
        WHERE pro_id = ?
        `,
        [userId]
      );
      const avg_rating_raw = (ratingRows as any[])[0]?.avg_rating;
      const avg_rating =
        avg_rating_raw !== null && avg_rating_raw !== undefined
          ? Number(avg_rating_raw)
          : 0;

      // Ancienneté : années ou mois
      const [durationRows] = await db.execute(
        `
        SELECT
          TIMESTAMPDIFF(YEAR, created_at, CURDATE()) AS diff_years,
          TIMESTAMPDIFF(MONTH, created_at, CURDATE()) AS diff_months
        FROM users
        WHERE id = ?
        `,
        [userId]
      );

      const durationRow = (durationRows as any[])[0];
      const diffYears = Number(durationRow?.diff_years ?? 0);
      const diffMonthsTotal = Number(durationRow?.diff_months ?? 0);

      let years_on_blyss: string;

      if (diffYears >= 1) {
        const remainingMonths = diffMonthsTotal % 12;
        years_on_blyss =
          remainingMonths > 0
            ? `${diffYears} an${diffYears > 1 ? "s" : ""} et ${remainingMonths} mois`
            : `${diffYears} an${diffYears > 1 ? "s" : ""}`;
      } else if (diffMonthsTotal >= 1) {
        years_on_blyss = `${diffMonthsTotal} mois`;
      } else {
        years_on_blyss = "Moins d’1 mois";
      }

      const { password_hash, IBAN, bankaccountname, ...userWithoutSensitive } = user;

      const payload = {
        ...userWithoutSensitive,
        ...decryptedBankData, // Ajoute les données déchiffrées
        clients_count,
        avg_rating,
        years_on_blyss,
      };


      return res.json({
        success: true,
        data: payload,
      });
    } catch (err) {
      console.error("[/api/users] error =", err);
      return res
        .status(500)
        .json({ success: false, message: "Unable to fetch user" });
    }
  }
);


/* UPLOAD PHOTO */
const uploadDir = path.join(__dirname, "uploads/profile_photo");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user!.id}_${Date.now()}${ext}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG and PNG files are allowed"));
  }
};

const upload = multer({ storage, fileFilter });

app.post(
  "/api/users/upload-photo",
  authMiddleware,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file || !req.user?.id) {
        return res
          .status(400)
          .json({ success: false, message: "No file or userId provided" });
      }

      const photoPath = `/uploads/profile_photo/${req.file.filename}`;

      await db.execute("UPDATE users SET profile_photo = ? WHERE id = ?", [
        photoPath,
        req.user.id,
      ]);

      res.json({ success: true, photo: photoPath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  }
);

/* UPDATE USER PROFILE */
app.put(
  "/api/users/update",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        first_name,
        last_name,
        activity_name,
        city,
        instagram_account,
        currentPassword,
        newPassword,
      } = req.body;

      const [rows] = await db.execute("SELECT * FROM users WHERE id = ?", [
        req.user!.id,
      ]);
      const user = (rows as User[])[0];

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      let passwordHash = user.password_hash;
      if (newPassword) {
        if (!currentPassword) {
          return res
            .status(400)
            .json({ success: false, message: "Current password required" });
        }
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid current password" });
        }
        if (currentPassword === newPassword) {
          return res.status(400).json({
            success: false,
            message: "New password must be different from current password",
          });
        }
        passwordHash = await bcrypt.hash(newPassword, 12);
      }

      const updatedFirstName =
        first_name !== undefined ? first_name : user.first_name;
      const updatedLastName =
        last_name !== undefined ? last_name : user.last_name;
      const updatedActivityName =
        user.role === "pro"
          ? activity_name !== undefined
            ? activity_name
            : user.activity_name
          : null;
      const updatedCity =
        user.role === "pro"
          ? city !== undefined
            ? city
            : user.city
          : null;
      const updatedInstagramAccount =
        user.role === "pro"
          ? instagram_account !== undefined
            ? instagram_account
            : user.instagram_account
          : null;

      await db.execute(
        `
        UPDATE users
        SET first_name = ?, last_name = ?, activity_name = ?, city = ?, instagram_account = ?, password_hash = ?
        WHERE id = ?
      `,
        [
          updatedFirstName,
          updatedLastName,
          updatedActivityName,
          updatedCity,
          updatedInstagramAccount,
          passwordHash,
          req.user!.id,
        ]
      );

      const [updatedRows] = await db.execute(
        "SELECT * FROM users WHERE id = ?",
        [req.user!.id]
      );
      const updatedUser = (updatedRows as User[])[0];
      const { password_hash, ...userWithoutPassword } = updatedUser;

      res.json({ success: true, data: userWithoutPassword });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Update failed" });
    }
  }
);

/* CREATE SUBSCRIPTION */
app.post(
  "/api/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        plan,
        billingType,
        monthlyPrice,
        totalPrice,
        commitmentMonths,
        startDate,
        endDate,
        status,
        paymentId,
      } = req.body as CreateSubscriptionBody & { 
        status?: string; 
        paymentId?: string; 
      };

      if (!plan || !billingType || !monthlyPrice || !startDate) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      if (status === "active" && !paymentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment ID required for active subscription" 
        });
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        const subscriptionStatus = status || "pending";

        const [result] = await connection.execute(
          `
          INSERT INTO subscriptions
            (client_id, plan, billing_type, monthly_price, total_price, 
             commitment_months, start_date, end_date, status, payment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            req.user.id,
            plan,
            billingType,
            monthlyPrice,
            totalPrice ?? null,
            commitmentMonths ?? null,
            startDate,
            endDate ?? null,
            subscriptionStatus,  // ✅ Utilise le statut reçu
            paymentId ?? null,   // ✅ Enregistre l'ID du paiement
          ]
        );

        // ✅ IMPORTANT : Mettre à jour pro_status SEULEMENT si le statut est "active"
        if (subscriptionStatus === "active") {
          await connection.execute(
            `UPDATE users SET pro_status = 'active' WHERE id = ?`,
            [req.user.id]
          );
        }

        await connection.commit();

        const insertResult = result as any;
        const subscriptionId = insertResult.insertId;

        res.status(201).json({
          success: true,
          data: { 
            id: subscriptionId,
            subscriptionId,  // Alias pour compatibilité
            status: subscriptionStatus 
          },
        });
      } catch (err) {
        await connection.rollback();
        console.error("Error creating subscription:", err);
        res.status(500).json({
          success: false,
          message: "Failed to create subscription",
        });
      } finally {
        connection.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// ✅ ROUTE GET - Récupérer l'abonnement actuel (CORRIGÉE)
app.get(
  "/api/subscriptions/current",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id; // ✅ Utilise req.user.id (pas userId)
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      // ✅ Chercher l'abonnement actif avec MySQL (pas Mongoose)
      const [rows] = await connection.query(
        `
        SELECT 
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId]
      ) as [{
        id: number;
        plan: string;
        billing_type: string;
        monthly_price: number;
        total_price: number | null;
        commitment_months: number | null;
        start_date: string;
        end_date: string | null;
        status: string;
        created_at: string;
      }[], any];

      // ✅ Pas d'abonnement actif
      if (!rows || rows.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: "Aucun abonnement actif"
        });
      }

      const subscription = rows[0];

      // ✅ Retourner les informations formatées
      res.json({
        success: true,
        data: {
          id: subscription.id,
          plan: subscription.plan,
          billingType: subscription.billing_type,
          status: subscription.status,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
          monthlyPrice: subscription.monthly_price,
          totalPrice: subscription.total_price,
          commitmentMonths: subscription.commitment_months,
          createdAt: subscription.created_at
        }
      });

    } catch (error) {
      console.error("Erreur lors de la récupération de l'abonnement:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ✅ ROUTE POST - Créer un abonnement (OPTIMISÉE)
app.post(
  "/api/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      const {
        plan,
        billingType,
        monthlyPrice,
        totalPrice,
        commitmentMonths,
        startDate,
        endDate,
        status,
        paymentId,
      } = req.body;

      // ✅ Validation des champs requis
      if (!plan || !billingType || !monthlyPrice || !startDate) {
        return res.status(400).json({
          success: false,
          message: "Champs requis manquants"
        });
      }

      if (status === "active" && !paymentId) {
        return res.status(400).json({
          success: false,
          message: "ID de paiement requis pour un abonnement actif"
        });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // ✅ Désactiver les anciens abonnements actifs
        await connection.execute(
          `
          UPDATE subscriptions
          SET status = 'cancelled'
          WHERE client_id = ?
            AND status = 'active'
          `,
          [userId]
        );

        // ✅ Créer le nouvel abonnement
        const [result] = await connection.execute(
          `
          INSERT INTO subscriptions
            (client_id, plan, billing_type, monthly_price, total_price, 
             commitment_months, start_date, end_date, status, payment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId,
            plan,
            billingType,
            monthlyPrice,
            totalPrice ?? null,
            commitmentMonths ?? null,
            startDate,
            endDate ?? null,
            status || "active",
            paymentId ?? null,
          ]
        );

        // ✅ Mettre à jour le statut pro si abonnement actif
        if (status === "active" || !status) {
          await connection.execute(
            `UPDATE users SET pro_status = 'active' WHERE id = ?`,
            [userId]
          );
        }

        await connection.commit();

        const insertResult = result as any;
        const subscriptionId = insertResult.insertId;

        res.status(201).json({
          success: true,
          data: {
            id: subscriptionId,
            subscriptionId,
            status: status || "active"
          },
          message: "Abonnement créé avec succès"
        });

      } catch (err) {
        await connection.rollback();
        throw err;
      }

    } catch (error) {
      console.error("Erreur lors de la création de l'abonnement:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la création de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ✅ ROUTE PATCH - Annuler un abonnement (NOUVELLE)
app.patch(
  "/api/subscriptions/:id/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const subscriptionId = Number(req.params.id);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      // ✅ Vérifier que l'abonnement appartient à l'utilisateur
      const [rows] = await connection.query(
        `
        SELECT id, status
        FROM subscriptions
        WHERE id = ? AND client_id = ?
        `,
        [subscriptionId, userId]
      ) as [{ id: number; status: string }[], any];

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Abonnement non trouvé"
        });
      }

      // ✅ Annuler l'abonnement
      await connection.execute(
        `
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [subscriptionId]
      );

      // ✅ Mettre à jour le statut pro de l'utilisateur
      await connection.execute(
        `UPDATE users SET pro_status = 'inactive' WHERE id = ?`,
        [userId]
      );

      res.json({
        success: true,
        message: "Abonnement annulé avec succès"
      });

    } catch (error) {
      console.error("Erreur lors de l'annulation:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'annulation de l'abonnement"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ✅ ROUTE GET - Historique des abonnements (BONUS)
app.get(
  "/api/subscriptions/history",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié"
        });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
        ORDER BY created_at DESC
        `,
        [userId]
      );

      res.json({
        success: true,
        data: rows
      });

    } catch (error) {
      console.error("Erreur lors de la récupération de l'historique:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);



/* UPDATE PAYMENTS */
app.put(
  "/api/users/payments",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { bankaccountname, IBAN, accept_online_payment } =
        req.body as UpdatePaymentsBody;

      if (accept_online_payment) {
        if (!bankaccountname || !bankaccountname.trim()) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Le titulaire du compte est requis.",
            });
        }

        if (bankaccountname.trim().length < 2) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Le nom du titulaire doit contenir au moins 2 caractères.",
            });
        }

        if (!IBAN || !IBAN.trim()) {
          return res
            .status(400)
            .json({ success: false, message: "L'IBAN est requis." });
        }

        const formattedIban = electronicFormatIBAN(IBAN);
        if (!isValidIBAN(formattedIban)) {
          return res
            .status(400)
            .json({ success: false, message: "IBAN invalide." });
        }

        const encryptedIban = encryptSensitiveData(formattedIban);
        const encryptedAccountName = encryptSensitiveData(bankaccountname.trim());
        const ibanLast4 = formattedIban.slice(-4);

        const ibanHash = crypto
          .createHash('sha256')
          .update(formattedIban)
          .digest('hex');

        const [existing] = await db.execute(
          `SELECT id FROM users 
           WHERE id != ? 
           AND iban_last4 = ?
           AND SHA2(IBAN, 256) = ?`,
          [userId, ibanLast4, ibanHash]
        );

        if ((existing as any[]).length > 0) {
          return res.status(409).json({
            success: false,
            message: "Cet IBAN est déjà utilisé par un autre compte.",
          });
        }

        await db.execute(
          `
          UPDATE users
          SET 
            bankaccountname = ?, 
            IBAN = ?, 
            iban_last4 = ?,
            accept_online_payment = 1,
            bank_info_updated_at = NOW()
          WHERE id = ?
        `,
          [encryptedAccountName, encryptedIban, ibanLast4, userId]
        );
      } else {
        await db.execute(
          `
          UPDATE users
          SET accept_online_payment = 0
          WHERE id = ?
        `,
          [userId]
        );
      }

      const [rows] = await db.execute(
        `SELECT bankaccountname, IBAN, iban_last4, accept_online_payment 
         FROM users WHERE id = ?`,
        [userId]
      );
      const record = (rows as any[])[0];

      let maskedIban: string | null = null;
      let accountHolderName: string | null = null;

      if (record.IBAN) {
        try {
          const plainIban = decryptSensitiveData(record.IBAN as string);
          maskedIban = plainIban.replace(/.(?=.{4})/g, "•");
        } catch (err) {
          console.error("Error decrypting IBAN:", err);
          maskedIban = null;
        }
      }

      if (record.bankaccountname) {
        try {
          accountHolderName = decryptSensitiveData(record.bankaccountname as string);
        } catch (err) {
          console.error("Error decrypting account name:", err);
          accountHolderName = null;
        }
      }

      res.json({
        success: true,
        data: {
          bankaccountname: accountHolderName,
          IBAN: maskedIban,
          iban_last4: record.iban_last4,
          accept_online_payment: Boolean(record.accept_online_payment),
        },
      });
    } catch (err) {
      console.error("Payment update error:", err);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la mise à jour des paiements.",
      });
    }
  }
);


app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* HELPER PRO ID */
function getProId(req: AuthenticatedRequest): number {
  const proId = req.user?.id;
  if (!proId) {
    throw new Error("Pro non authentifié");
  }
  return proId;
}

/* PRO DASHBOARD */
app.get(
  "/api/pro/dashboard",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      // 1) Prestations cette semaine
      const [thisWeekRows] = (await connection.query(
        `
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ count: number }[], any];
      const servicesThisWeek = thisWeekRows[0]?.count ?? 0;

      // 2) Prestations semaine dernière
      const [lastWeekRows] = (await connection.query(
        `
        SELECT COUNT(*) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1) - 1
        `,
        [proId]
      )) as [{ count: number }[], any];
      const servicesLastWeek = lastWeekRows[0]?.count ?? 0;

      let change = 0;
      let isUp = true;
      if (servicesLastWeek > 0) {
        change = Math.round(
          ((servicesThisWeek - servicesLastWeek) / servicesLastWeek) * 100
        );
        isUp = change >= 0;
        change = Math.abs(change);
      }

      // 3) Estimation du jour (CA du jour)
      const [todayRows] = (await connection.query(
        `
        SELECT IFNULL(SUM(price), 0) AS total
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND DATE(start_datetime) = CURDATE()
        `,
        [proId]
      )) as [{ total: number | null }[], any];
      const todayForecast = Number(todayRows[0]?.total ?? 0);

      // 4) 3 prochaines clientes
      const [upcomingRows] = (await connection.query(
        `
        SELECT
          r.id,
          CONCAT(u.first_name, ' ', u.last_name) AS client_name,
          p.name AS prestation_name,
          DATE_FORMAT(r.start_datetime, '%H:%i') AS start_time,
          r.price,
          r.status
        FROM reservations r
        JOIN users u ON u.id = r.client_id
        JOIN prestations p ON p.id = r.prestation_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND r.start_datetime >= NOW()
        ORDER BY r.start_datetime ASC
        LIMIT 3
        `,
        [proId]
      )) as [{
        id: number;
        client_name: string;
        prestation_name: string;
        start_time: string;
        price: number;
        status: string;
      }[], any];

      const upcomingClients = upcomingRows.map((row) => {
        const initials = row.client_name
          .split(" ")
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase())
          .join("")
          .slice(0, 2);

        const status =
          row.status === "confirmed"
            ? "upcoming"
            : row.status === "completed"
              ? "completed"
              : "upcoming";

        return {
          id: row.id,
          name: row.client_name,
          service: row.prestation_name,
          time: row.start_time,
          price: Number(row.price),
          status,
          avatar: initials
        };
      });

      // 5) Taux de remplissage basé sur les créneaux (slots)
      // total de créneaux ouverts cette semaine
      const [slotsRows] = (await connection.query(
        `
        SELECT COUNT(*) AS total_slots
        FROM slots
        WHERE pro_id = ?
          AND status = 'open'
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ total_slots: number }[], any];
      const totalSlots = slotsRows[0]?.total_slots ?? 0;

      // créneaux réservés (slots qui ont au moins une réservation confirmée/completed)
      const [bookedRows] = (await connection.query(
        `
        SELECT COUNT(DISTINCT r.slot_id) AS booked_slots
        FROM reservations r
        JOIN slots s ON s.id = r.slot_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND YEARWEEK(s.start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ booked_slots: number }[], any];
      const bookedSlots = bookedRows[0]?.booked_slots ?? 0;

      let fillRate = 0;
      if (totalSlots > 0) {
        fillRate = Math.round((bookedSlots / totalSlots) * 100);
      }

      // 6) Nombre de clientes uniques cette semaine
      const [clientsWeekRows] = (await connection.query(
        `
        SELECT COUNT(DISTINCT client_id) AS count
        FROM reservations
        WHERE pro_id = ?
          AND status IN ('confirmed', 'completed')
          AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
        `,
        [proId]
      )) as [{ count: number }[], any];
      const clientsThisWeek = clientsWeekRows[0]?.count ?? 0;

      // 7) Top prestations (30 derniers jours)
      const [topServicesRows] = (await connection.query(
        `
        SELECT
          p.name AS prestation_name,
          COUNT(*) AS count
        FROM reservations r
        JOIN prestations p ON p.id = r.prestation_id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed', 'completed')
          AND r.start_datetime >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY p.id, p.name
        ORDER BY count DESC
        LIMIT 5
        `,
        [proId]
      )) as [{ prestation_name: string; count: number }[], any];

      const totalTopCount = topServicesRows.reduce(
        (acc, row) => acc + Number(row.count),
        0
      );

      const topServices = topServicesRows.map((row) => ({
        name: row.prestation_name,
        percentage:
          totalTopCount > 0
            ? Math.round((Number(row.count) / totalTopCount) * 100)
            : 0
      }));

      // 8) Revenus de la semaine par jour
      const [indexedRevenueRows] = (await connection.query(
        `
  SELECT
    jour,
    total,
    DAYOFWEEK(jour) AS dayOfWeek
  FROM (
    SELECT
      DATE(start_datetime) AS jour,
      SUM(price) AS total
    FROM reservations
    WHERE pro_id = ?
      AND status IN ('confirmed', 'completed')
      AND YEARWEEK(start_datetime, 1) = YEARWEEK(CURDATE(), 1)
    GROUP BY DATE(start_datetime)
  ) AS t
  ORDER BY jour
  `,
        [proId]
      )) as [{ jour: string; total: number | null; dayOfWeek: number }[], any];

      const weeklyRevenue = indexedRevenueRows.map((row) => {
        const dow = row.dayOfWeek; // 1=Dim, 2=Lun, ..., 7=Sam
        let label = "";
        switch (dow) {
          case 2:
            label = "Lun";
            break;
          case 3:
            label = "Mar";
            break;
          case 4:
            label = "Mer";
            break;
          case 5:
            label = "Jeu";
            break;
          case 6:
            label = "Ven";
            break;
          case 7:
            label = "Sam";
            break;
          case 1:
          default:
            label = "Dim";
            break;
        }

        return {
          day: label,
          amount: Number(row.total ?? 0),
        };
      });

      const responseBody = {
        weeklyStats: {
          services: servicesThisWeek,
          change,
          isUp
        },
        todayForecast,
        upcomingClients,
        fillRate,
        clientsThisWeek,
        topServices,
        weeklyRevenue
      };

      res.json(responseBody);
    } catch (err: any) {
      console.error(err);
      if (err.message === "Pro non authentifié") {
        return res.status(401).json({ message: "Non authentifié" });
      }
      res.status(500).json({ message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.get(
  "/api/pro/calendar",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { from, to } = req.query as { from?: string; to?: string };

      console.log("[CALENDAR] proId =", proId, "from =", from, "to =", to);

      connection = await db.getConnection();

      const params: any[] = [proId];
      let where = "r.pro_id = ? AND r.status IN ('confirmed','completed')";

      if (from) {
        where += " AND DATE(r.start_datetime) >= ?";
        params.push(from);
      }
      if (to) {
        where += " AND DATE(r.start_datetime) <= ?";
        params.push(to);
      }

      console.log("[CALENDAR] where =", where, "params =", params);

      const [rows] = (await connection.query(
        `
        SELECT
          r.id,
          DATE(r.start_datetime) AS date,
          DATE_FORMAT(r.start_datetime, '%H:%i') AS time,
          TIMESTAMPDIFF(MINUTE, r.start_datetime, r.end_datetime) AS duration_minutes,
          r.price,
          u.first_name,
          u.last_name,
          p.name AS prestation_name
        FROM reservations r
        JOIN users u ON u.id = r.client_id
        JOIN prestations p ON p.id = r.prestation_id
        WHERE ${where}
        ORDER BY r.start_datetime ASC
        `,
        params
      )) as [{
        id: number;
        date: string;
        time: string;
        duration_minutes: number;
        price: number;
        first_name: string;
        last_name: string;
        prestation_name: string;
      }[], any];

      console.log("[CALENDAR] rows length =", rows.length);
      if (rows.length) {
        console.log("[CALENDAR] first row =", rows[0]);
      }

      const data = rows.map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        duration:
          r.duration_minutes >= 60
            ? `${Math.floor(r.duration_minutes / 60)}h${r.duration_minutes % 60 ? r.duration_minutes % 60 : ""
              }`.trim()
            : `${r.duration_minutes}min`,
        price: Number(r.price),
        client_name: `${r.first_name} ${r.last_name}`,
        prestation_name: r.prestation_name,
      }));

      res.json(data);
    } catch (err) {
      console.error("[CALENDAR] error =", err);
      res.status(500).json({ message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.get(
  "/api/pro/clients",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [rows] = (await connection.query(
        `
        SELECT
          c.id,
          CONCAT(c.first_name, ' ', c.last_name) AS name,
          c.phone_number AS phone,
          MAX(r.start_datetime) AS last_visit,
          COUNT(*) AS total_visits,
          n.notes
        FROM reservations r
        JOIN users c ON c.id = r.client_id
        LEFT JOIN pro_client_notes n
          ON n.pro_id = r.pro_id
         AND n.client_id = c.id
        WHERE r.pro_id = ?
          AND r.status IN ('confirmed','completed')
        GROUP BY c.id, c.first_name, c.last_name, c.phone_number, n.notes
        ORDER BY last_visit DESC
        `,
        [proId]
      )) as [{
        id: number;
        name: string;
        phone: string | null;
        last_visit: Date;
        total_visits: number;
        notes: string | null;
      }[], any];

      const now = new Date();

      const data = rows.map((r) => {
        const last = new Date(r.last_visit);
        const diffMs = now.getTime() - last.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let lastVisitLabel = "";
        if (diffDays === 0) lastVisitLabel = "Aujourd'hui";
        else if (diffDays === 1) lastVisitLabel = "Il y a 1 jour";
        else lastVisitLabel = `Il y a ${diffDays} jours`;

        const initials = r.name
          .split(" ")
          .filter(Boolean)
          .map((p) => p[0]?.toUpperCase())
          .join("")
          .slice(0, 2);

        return {
          id: r.id,
          name: r.name,
          phone: r.phone || "",
          lastVisit: lastVisitLabel,
          totalVisits: Number(r.total_visits),
          notes: r.notes || "",           // <-- utilise ce qui vient de la BDD
          avatar: initials,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);


app.put(
  "/api/pro/clients/:clientId/notes",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const clientId = Number(req.params.clientId);
      const { notes } = req.body as { notes: string };

      if (!clientId || Number.isNaN(clientId)) {
        return res
          .status(400)
          .json({ success: false, message: "Client invalide" });
      }

      connection = await db.getConnection();

      await connection.query(
        `
        INSERT INTO pro_client_notes (pro_id, client_id, notes)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE notes = VALUES(notes)
        `,
        [proId, clientId, notes]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Update client notes error:", err);
      res
        .status(500)
        .json({ success: false, message: "Erreur lors de la mise à jour des notes" });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.get(
  "/api/pro/subscription",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      const [rows] = (await connection.query(
        `
        SELECT
          id,
          plan,
          billing_type,
          monthly_price,
          total_price,
          commitment_months,
          start_date,
          end_date,
          status,
          created_at
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [proId]
      )) as {
        length: any;
        id: number;
        plan: "start" | "serenite" | "signature";
        billing_type: "monthly" | "one_time";
        monthly_price: number;
        total_price: number | null;
        commitment_months: number | null;
        start_date: string;
        end_date: string | null;
        status: "active" | "expired" | "cancelled";
        created_at: string;
      }[];

      if (!rows.length) {
        return res.json({ success: true, data: null });
      }

      const sub = rows[0];

      res.json({
        success: true,
        data: {
          id: sub.id,
          plan: sub.plan,
          billingType: sub.billing_type,
          monthlyPrice: sub.monthly_price,
          totalPrice: sub.total_price,
          commitmentMonths: sub.commitment_months,
          startDate: sub.start_date,
          endDate: sub.end_date,
          status: sub.status,
        },
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.put(
  "/api/pro/subscription/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

      // on récupère l’abonnement actif le plus récent
      const [rows] = (await connection.query(
        `
        SELECT id
        FROM subscriptions
        WHERE client_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [proId]
      )) as {
        length: any; id: number 
}[];

      if (!rows.length) {
        return res.json({ success: false, message: "Aucun abonnement actif." });
      }

      const subscriptionId = rows[0].id;

      // on marque comme "cancelled"
      await connection.query(
        `
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [subscriptionId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ success: false, message: "Erreur lors de la résiliation." });
    } finally {
      if (connection) connection.release();
    }
  }
);


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});