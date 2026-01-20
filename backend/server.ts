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

// ==========================================
// CONFIGURATION CHIFFREMENT IBAN
// ==========================================

const IBAN_KEY = process.env.IBAN_ENC_KEY
  ? Buffer.from(process.env.IBAN_ENC_KEY, "hex")
  : null;

const IBAN_IV = process.env.IBAN_ENC_IV
  ? Buffer.from(process.env.IBAN_ENC_IV, "hex")
  : null;

if (!IBAN_KEY || IBAN_KEY.length !== 32) {
  process.exit(1);
}

if (!IBAN_IV || ![12, 16].includes(IBAN_IV.length)) {
  process.exit(1);
}

console.log("✅ Clés de chiffrement IBAN chargées");

function encryptSensitiveData(plain: string): string {
  if (!plain || plain.trim() === '') {
    return '';
  }
  if (!IBAN_KEY || !IBAN_IV) {
    throw new Error("Clés de chiffrement IBAN non configurées");
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
  if (!IBAN_KEY || !IBAN_IV) {
    throw new Error("Clés de chiffrement IBAN non configurées");
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

const encryptIban = encryptSensitiveData;
const decryptIban = decryptSensitiveData;

// ==========================================
// MIDDLEWARE
// ==========================================

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

const authenticateToken = authMiddleware;

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ==========================================
// INTERFACES
// ==========================================

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
  bio?: string | null;
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

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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

function getProId(req: AuthenticatedRequest): number {
  const proId = req.user?.id;
  if (!proId) {
    throw new Error("Pro non authentifié");
  }
  return proId;
}

// ==========================================
// PUBLIC ROUTES - SPECIALISTS
// ==========================================

/* GET SINGLE PRO (PUBLIC) */
app.get(
  "/api/users/pros/:id",
  async (req: Request, res: Response) => {
    try {
      console.log("📞 GET /api/users/pros/:id called with id:", req.params.id);

      const proId = parseInt(req.params.id);

      if (isNaN(proId)) {
        return res.status(400).json({
          success: false,
          message: "ID invalide"
        });
      }

      const [rows] = await db.query(
        `SELECT 
          id, first_name, last_name, activity_name, city, 
          instagram_account, profile_photo, banner_photo, bio, pro_status
        FROM users
        WHERE id = ? AND role = 'pro' AND pro_status = 'active'`,
        [proId]
      );

      const pro = (rows as any[])[0];

      if (!pro) {
        return res.status(404).json({
          success: false,
          message: "Professionnel non trouvé"
        });
      }

      console.log("✅ Pro found:", pro.id);

      res.json({ success: true, data: pro });
    } catch (error) {
      console.error("❌ Error fetching pro:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    }
  }
);

/* GET PRESTATIONS BY PRO (PUBLIC) */
app.get(
  "/api/prestations/pro/:id",
  async (req: Request, res: Response) => {
    try {
      const proId = parseInt(req.params.id);

      const [rows] = await db.query(
        `SELECT id, name, description, price, duration_minutes, active
         FROM prestations
         WHERE pro_id = ?
         ORDER BY name ASC`,
        [proId]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error("Error fetching prestations:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    }
  }
);

/* ============================================
   SLOTS & AVAILABILITY ROUTES
   ============================================ */

// GET: Récupérer les créneaux disponibles pour un pro sur une date donnée
app.get(
  "/api/slots/available/:proId/:date",
  async (req: Request, res: Response) => {
    try {
      const proId = parseInt(req.params.proId);
      const dateStr = req.params.date; // Format: YYYY-MM-DD

      const startOfDay = `${dateStr} 00:00:00`;
      const endOfDay = `${dateStr} 23:59:59`;

      // Récupérer les slots disponibles
      const [availableSlots] = await db.query(
        `SELECT id, start_datetime, end_datetime, duration
         FROM slots
         WHERE pro_id = ? 
         AND status = 'available'
         AND start_datetime BETWEEN ? AND ?
         ORDER BY start_datetime ASC`,
        [proId, startOfDay, endOfDay]
      );

      // Formater les créneaux horaires uniquement (HH:MM)
      const formattedSlots = (availableSlots as any[]).map(slot => {
        const time = new Date(slot.start_datetime).toTimeString().slice(0, 5);
        return {
          id: slot.id,
          time: time,
          duration: slot.duration,
          start_datetime: slot.start_datetime,
          end_datetime: slot.end_datetime
        };
      });

      res.json({ success: true, data: formattedSlots });
    } catch (error) {
      console.error("Error fetching available slots:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// GET: Récupérer tous les slots d'un pro (pour gestion côté pro)
app.get(
  "/api/slots/pro/:proId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = parseInt(req.params.proId);

      // Vérifier que c'est bien le pro qui demande ses slots
      if (req.user?.id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      const [slots] = await db.query(
        `SELECT id, start_datetime, end_datetime, status, duration
         FROM slots
         WHERE pro_id = ?
         AND start_datetime >= NOW()
         ORDER BY start_datetime ASC`,
        [proId]
      );

      res.json({ success: true, data: slots });
    } catch (error) {
      console.error("Error fetching pro slots:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// POST: Créer des slots (génération automatique ou manuelle)
app.post(
  "/api/slots/create",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proId = req.user?.id;
      const { start_datetime, end_datetime, duration } = req.body;

      if (!start_datetime || !end_datetime) {
        return res.status(400).json({
          success: false,
          message: "Dates de début et fin requises"
        });
      }

      // Insérer le slot
      const [result] = await db.query(
        `INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [proId, start_datetime, end_datetime, duration || 60]
      );

      res.json({
        success: true,
        message: "Créneau créé",
        data: { id: (result as any).insertId }
      });
    } catch (error) {
      console.error("Error creating slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// PATCH: Bloquer un slot
app.patch(
  "/api/slots/:slotId/block",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const slotId = parseInt(req.params.slotId);
      const proId = req.user?.id;

      // Vérifier que le slot appartient au pro
      const [slots] = await db.query(
        `SELECT pro_id FROM slots WHERE id = ?`,
        [slotId]
      );

      if ((slots as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Créneau introuvable"
        });
      }

      if ((slots as any[])[0].pro_id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      // Bloquer le slot
      await db.query(
        `UPDATE slots SET status = 'blocked' WHERE id = ?`,
        [slotId]
      );

      res.json({
        success: true,
        message: "Créneau bloqué"
      });
    } catch (error) {
      console.error("Error blocking slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);

// DELETE: Supprimer un slot
app.delete(
  "/api/slots/:slotId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const slotId = parseInt(req.params.slotId);
      const proId = req.user?.id;

      // Vérifier que le slot appartient au pro
      const [slots] = await db.query(
        `SELECT pro_id FROM slots WHERE id = ?`,
        [slotId]
      );

      if ((slots as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Créneau introuvable"
        });
      }

      if ((slots as any[])[0].pro_id !== proId) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé"
        });
      }

      // Supprimer le slot
      await db.query(`DELETE FROM slots WHERE id = ?`, [slotId]);

      res.json({
        success: true,
        message: "Créneau supprimé"
      });
    } catch (error) {
      console.error("Error deleting slot:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  }
);


// ==========================================
// AUTH ROUTES
// ==========================================

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

// ==========================================
// USER ROUTES
// ==========================================

/* GET CURRENT USER + STATS */
app.get(
  "/api/users",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [userRows] = await db.execute("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);
      const user = (userRows as User[])[0];
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      let decryptedBankData: any = {};
      if (user.IBAN) {
        try {
          const plainIban = decryptSensitiveData(user.IBAN as string);
          decryptedBankData.IBAN = plainIban.replace(/.(?=.{4})/g, "•");
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
        years_on_blyss = "Moins d'1 mois";
      }

      const { password_hash, IBAN, bankaccountname, ...userWithoutSensitive } = user;

      const payload = {
        ...userWithoutSensitive,
        ...decryptedBankData,
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
const uploadDir = path.join(__dirname, "/uploads/profile_photo");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* UPLOAD BANNER - DOSSIER */
const uploadBannerDir = path.join(__dirname, "/uploads/banners");
if (!fs.existsSync(uploadBannerDir)) {
  fs.mkdirSync(uploadBannerDir, { recursive: true });
}


/* STORAGE PROFILE PHOTO */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `pp_${req.user!.id}_${Date.now()}${ext}`);
  },
});

/* STORAGE BANNER */
const storageBanner = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadBannerDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `banner_${req.user!.id}_${Date.now()}${ext}`);
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

const uploadBanner = multer({
  storage: storageBanner,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

/* UPLOAD PROFILE PHOTO */
app.post(
  "/api/users/upload-photo",
  authMiddleware,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file || !req.user?.id) {
        return res.status(400).json({ 
          success: false, 
          message: "No file or userId provided" 
        });
      }

      // ✅ CORRIGER : Enlever tout ce qui est avant "uploads"
      const photoPath = `uploads/profile_photo/${req.file.filename}`;

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

/* UPLOAD BANNER */
app.post(
  "/api/users/upload-banner",
  authMiddleware,
  uploadBanner.single("banner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Non authentifié"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Aucun fichier fourni"
        });
      }

      const fileUrl = `uploads/banners/${req.file.filename}`;

      await db.query(
        'UPDATE users SET banner_photo = ? WHERE id = ?',
        [fileUrl, userId]
      );

      const [users] = await db.query(
        'SELECT id, email, first_name, last_name, role, city, profile_photo, banner_photo, bio, instagram_account, activity_name FROM users WHERE id = ?',
        [userId]
      ) as any;

      res.json({
        success: true,
        message: "Bannière mise à jour",
        data: users[0]
      });

    } catch (error) {
      console.error("Error uploading banner:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'upload"
      });
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
        bio,
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
      const updatedBio = bio !== undefined ? bio : user.bio;

      await db.execute(
        `UPDATE users
         SET first_name = ?, last_name = ?, activity_name = ?, city = ?, instagram_account = ?, bio = ?, password_hash = ?
         WHERE id = ?`,
        [
          updatedFirstName,
          updatedLastName,
          updatedActivityName,
          updatedCity,
          updatedInstagramAccount,
          updatedBio,
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

// ==========================================
// PUBLIC ROUTES - SPECIALISTS
// ==========================================

/* GET ALL ACTIVE PROS (PUBLIC) */
app.get(
  "/api/users/pros",
  async (req: Request, res: Response) => {
    let connection;
    try {
      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name,
          u.city,
          u.instagram_account,
          u.profile_photo,
          u.banner_photo,
          u.bio,
          u.pro_status,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(DISTINCT r.id) as reviews_count
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        WHERE u.role = 'pro' AND u.pro_status = 'active'
        GROUP BY u.id
        ORDER BY avg_rating DESC, reviews_count DESC
        `
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching pros:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des professionnels",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET REVIEWS BY PRO (PUBLIC) */
app.get(
  "/api/reviews/pro/:proId",
  async (req: Request, res: Response) => {
    let connection;
    try {
      const proId = parseInt(req.params.proId);

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          id,
          pro_id,
          client_id,
          rating,
          comment,
          created_at
        FROM reviews
        WHERE pro_id = ?
        ORDER BY created_at DESC
        `,
        [proId]
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des avis",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// SUBSCRIPTION ROUTES
// ==========================================

/* CREATE SUBSCRIPTION */
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
        await connection.execute(
          `
          UPDATE subscriptions
          SET status = 'cancelled'
          WHERE client_id = ?
            AND status = 'active'
          `,
          [userId]
        );

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

/* GET CURRENT SUBSCRIPTION */
app.get(
  "/api/subscriptions/current",
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
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: "Aucun abonnement actif"
        });
      }

      const subscription = rows[0];

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

/* CANCEL SUBSCRIPTION */
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

      const [rows] = await connection.query(
        `
        SELECT id, status
        FROM subscriptions
        WHERE id = ? AND client_id = ?
        `,
        [subscriptionId, userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Abonnement non trouvé"
        });
      }

      await connection.execute(
        `
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [subscriptionId]
      );

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

/* GET SUBSCRIPTION HISTORY */
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

// ==========================================
// PRO DASHBOARD ROUTES
// ==========================================

/* PRO DASHBOARD */
app.get(
  "/api/pro/dashboard",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

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
      )) as [any[], any];

      const upcomingClients = upcomingRows.map((row) => {
        const initials = row.client_name
          .split(" ")
          .filter(Boolean)
          .map((part: string) => part[0]?.toUpperCase())
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
        const dow = row.dayOfWeek;
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

/* PRO CALENDAR */
app.get(
  "/api/pro/calendar",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { from, to } = req.query as { from?: string; to?: string };

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

      const [rows] = (await connection.query(
        `
        SELECT
          r.id,
          DATE(r.start_datetime) AS date,
          DATE_FORMAT(r.start_datetime, '%H:%i') AS time,
          p.duration_minutes AS duration_minutes,
          r.price,
          r.status,
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
      )) as [any[], any];

      const data = rows.map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        duration: r.duration_minutes,
        price: Number(r.price),
        status: r.status,
        client_name: `${r.first_name} ${r.last_name}`,
        prestation_name: r.prestation_name,
      }));

      res.json({ success: true, data });
    } catch (err) {
      console.error("[CALENDAR] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* PRO CLIENTS */
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
      )) as [any[], any];

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
          .map((p: string) => p[0]?.toUpperCase())
          .join("")
          .slice(0, 2);

        return {
          id: r.id,
          name: r.name,
          phone: r.phone || "",
          lastVisit: lastVisitLabel,
          totalVisits: Number(r.total_visits),
          notes: r.notes || "",
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

/* UPDATE CLIENT NOTES */
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

/* GET PRO SUBSCRIPTION */
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
      )) as any[];

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

/* CANCEL PRO SUBSCRIPTION */
app.put(
  "/api/pro/subscription/cancel",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);

      connection = await db.getConnection();

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
      )) as any[];

      if (!rows.length) {
        return res.json({ success: false, message: "Aucun abonnement actif." });
      }

      const subscriptionId = rows[0].id;

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

// ==========================================
// NOTIFICATION SETTINGS - CLIENT
// ==========================================

/* GET CLIENT NOTIFICATION SETTINGS */
app.get(
  "/api/client/notification-settings",
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
        `SELECT * FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        const defaultSettings = {
          user_id: userId,
          reminders: 1,
          changes: 1,
          messages: 1,
          late: 1,
          offers: 1,
          email_summary: 0
        };

        await connection.query(
          `INSERT INTO client_notification_settings SET ?`,
          [defaultSettings]
        );

        return res.status(200).json({
          success: true,
          data: {
            reminders: true,
            changes: true,
            messages: true,
            late: true,
            offers: true,
            email_summary: false
          },
          message: "Préférences initialisées avec les valeurs par défaut"
        });
      }

      const settings = rows[0];
      res.status(200).json({
        success: true,
        data: {
          reminders: Boolean(settings.reminders),
          changes: Boolean(settings.changes),
          messages: Boolean(settings.messages),
          late: Boolean(settings.late),
          offers: Boolean(settings.offers),
          email_summary: Boolean(settings.email_summary)
        }
      });

    } catch (error) {
      console.error("Erreur lors de la récupération des préférences:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des préférences"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE CLIENT NOTIFICATION SETTINGS */
app.put(
  "/api/client/notification-settings",
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
        reminders,
        changes,
        messages,
        late,
        offers,
        email_summary
      } = req.body;

      const fields = { reminders, changes, messages, late, offers, email_summary };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && typeof value !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `Le champ ${key} doit être un booléen`
          });
        }
      }

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT user_id FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO client_notification_settings 
           (user_id, reminders, changes, messages, late, offers, email_summary) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            reminders !== undefined ? (reminders ? 1 : 0) : 1,
            changes !== undefined ? (changes ? 1 : 0) : 1,
            messages !== undefined ? (messages ? 1 : 0) : 1,
            late !== undefined ? (late ? 1 : 0) : 1,
            offers !== undefined ? (offers ? 1 : 0) : 1,
            email_summary !== undefined ? (email_summary ? 1 : 0) : 0
          ]
        );
      } else {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined) {
            updateFields.push(`${key} = ?`);
            updateValues.push(value ? 1 : 0);
          }
        });

        if (updateFields.length > 0) {
          updateValues.push(userId);
          await connection.query(
            `UPDATE client_notification_settings 
             SET ${updateFields.join(", ")}, updated_at = NOW() 
             WHERE user_id = ?`,
            updateValues
          );
        }
      }

      const [updated] = await connection.query(
        `SELECT * FROM client_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      res.status(200).json({
        success: true,
        data: {
          reminders: Boolean(updated[0].reminders),
          changes: Boolean(updated[0].changes),
          messages: Boolean(updated[0].messages),
          late: Boolean(updated[0].late),
          offers: Boolean(updated[0].offers),
          email_summary: Boolean(updated[0].email_summary)
        },
        message: "Préférences mises à jour avec succès"
      });

    } catch (error) {
      console.error("Erreur lors de la mise à jour des préférences:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// NOTIFICATION SETTINGS - PRO
// ==========================================

/* GET PRO NOTIFICATION SETTINGS */
app.get(
  "/api/pro/notification-settings",
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
        `SELECT * FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (!rows || rows.length === 0) {
        const defaultSettings = {
          user_id: userId,
          new_reservation: 1,
          cancel_change: 1,
          daily_reminder: 1,
          client_message: 1,
          payment_alert: 1,
          activity_summary: 0
        };

        await connection.query(
          `INSERT INTO pro_notification_settings SET ?`,
          [defaultSettings]
        );

        return res.status(200).json({
          success: true,
          data: {
            new_reservation: true,
            cancel_change: true,
            daily_reminder: true,
            client_message: true,
            payment_alert: true,
            activity_summary: false
          }
        });
      }

      const settings = rows[0];
      res.status(200).json({
        success: true,
        data: {
          new_reservation: Boolean(settings.new_reservation),
          cancel_change: Boolean(settings.cancel_change),
          daily_reminder: Boolean(settings.daily_reminder),
          client_message: Boolean(settings.client_message),
          payment_alert: Boolean(settings.payment_alert),
          activity_summary: Boolean(settings.activity_summary)
        }
      });

    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE PRO NOTIFICATION SETTINGS */
app.put(
  "/api/pro/notification-settings",
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
        new_reservation,
        cancel_change,
        daily_reminder,
        client_message,
        payment_alert,
        activity_summary
      } = req.body;

      connection = await db.getConnection();

      const [existing] = await connection.query(
        `SELECT user_id FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO pro_notification_settings 
           (user_id, new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            new_reservation !== undefined ? (new_reservation ? 1 : 0) : 1,
            cancel_change !== undefined ? (cancel_change ? 1 : 0) : 1,
            daily_reminder !== undefined ? (daily_reminder ? 1 : 0) : 1,
            client_message !== undefined ? (client_message ? 1 : 0) : 1,
            payment_alert !== undefined ? (payment_alert ? 1 : 0) : 1,
            activity_summary !== undefined ? (activity_summary ? 1 : 0) : 0
          ]
        );
      } else {
        const fields = { new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary };
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined) {
            updateFields.push(`${key} = ?`);
            updateValues.push(value ? 1 : 0);
          }
        });

        if (updateFields.length > 0) {
          updateValues.push(userId);
          await connection.query(
            `UPDATE pro_notification_settings 
             SET ${updateFields.join(", ")}, updated_at = NOW() 
             WHERE user_id = ?`,
            updateValues
          );
        }
      }

      const [updated] = await connection.query(
        `SELECT * FROM pro_notification_settings WHERE user_id = ?`,
        [userId]
      ) as [any[], any];

      res.status(200).json({
        success: true,
        data: {
          new_reservation: Boolean(updated[0].new_reservation),
          cancel_change: Boolean(updated[0].cancel_change),
          daily_reminder: Boolean(updated[0].daily_reminder),
          client_message: Boolean(updated[0].client_message),
          payment_alert: Boolean(updated[0].payment_alert),
          activity_summary: Boolean(updated[0].activity_summary)
        }
      });

    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// SLOTS MANAGEMENT
// ==========================================

/* CREATE SLOT */
app.post(
  "/api/pro/slots",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { date, time, duration = 60 } = req.body;

      if (!date || !time) {
        return res.status(400).json({
          success: false,
          error: "Date et heure requises"
        });
      }

      const startDatetime = `${date} ${time}:00`;

      connection = await db.getConnection();

      console.log("Creating slot:", { proId, startDatetime, duration });

      await connection.query(
        `
        INSERT INTO slots (
          pro_id, 
          start_datetime, 
          end_datetime, 
          duration, 
          status, 
          created_at
        )
        VALUES (
          ?, 
          ?, 
          DATE_ADD(?, INTERVAL ? MINUTE), 
          ?, 
          'available', 
          NOW()
        )
        `,
        [proId, startDatetime, startDatetime, duration, duration]
      );

      res.json({ success: true, message: "Créneau créé" });
    } catch (err) {
      console.error("[CREATE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SLOTS */
app.get(
  "/api/pro/slots",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const { date } = req.query as { date?: string };

      if (!date) {
        return res.status(400).json({ success: false, error: "Date requise" });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT
          id,
          DATE_FORMAT(start_datetime, '%H:%i') AS time,
          duration,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 'past'
            ELSE status
          END AS computed_status,
          status AS original_status,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 0
            WHEN status = 'available' THEN 1
            ELSE 0
          END AS isActive,
          CASE 
            WHEN DATE_ADD(start_datetime, INTERVAL duration MINUTE) < NOW() THEN 0
            WHEN status = 'available' THEN 1
            WHEN status = 'booked' THEN 0
            ELSE 1
          END AS isAvailable
        FROM slots
        WHERE pro_id = ?
          AND DATE(start_datetime) = ?
        ORDER BY start_datetime ASC
        `,
        [proId, date]
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET SLOTS] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* UPDATE SLOT */
app.patch(
  "/api/pro/slots/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const slotId = parseInt(String(req.params.id));
      const { status } = req.body;

      if (!status || !['available', 'blocked'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Status invalide"
        });
      }

      connection = await db.getConnection();

      await connection.query(
        `
        UPDATE slots 
        SET status = ?
        WHERE id = ? AND pro_id = ?
        `,
        [status, slotId, proId]
      );

      res.json({ success: true, message: "Créneau mis à jour" });
    } catch (err) {
      console.error("[UPDATE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* DELETE SLOT */
app.delete(
  "/api/pro/slots/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const proId = getProId(req);
      const slotId = parseInt(String(req.params.id));

      connection = await db.getConnection();

      await connection.query(
        `
        DELETE FROM slots 
        WHERE id = ? AND pro_id = ?
        `,
        [slotId, proId]
      );

      res.json({ success: true, message: "Créneau supprimé" });
    } catch (err) {
      console.error("[DELETE SLOT] error =", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// CLIENT - SPECIALISTS ROUTES
// ==========================================

/* GET ALL SPECIALISTS */
app.get(
  "/api/client/specialists",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const { limit = 50, page = 1, search = "", city = "" } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      connection = await db.getConnection();

      let whereClause = "WHERE u.role = 'pro' AND u.pro_status = 'active'";
      const params: any[] = [];

      if (search) {
        whereClause += ` AND (
          u.activity_name LIKE ? OR 
          u.first_name LIKE ? OR 
          u.last_name LIKE ? OR 
          u.city LIKE ?
        )`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      if (city) {
        whereClause += ` AND u.city LIKE ?`;
        params.push(`%${city}%`);
      }

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name as business_name,
          u.city,
          u.profile_photo as profile_image_url,
          u.banner_photo as cover_image_url,
          COALESCE(AVG(r.rating), 0) as rating,
          COUNT(DISTINCT r.id) as reviews_count,
          'Prothésiste ongulaire' as specialty
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        ${whereClause}
        GROUP BY u.id
        ORDER BY rating DESC, reviews_count DESC
        LIMIT ? OFFSET ?
        `,
        [...params, Number(limit), offset]
      );

      const specialists = (rows as any[]).map((row) => ({
        id: row.id,
        business_name: row.business_name || `${row.first_name} ${row.last_name}`,
        specialty: row.specialty,
        city: row.city,
        rating: Number(row.rating),
        reviews_count: Number(row.reviews_count),
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
        user: {
          first_name: row.first_name,
          last_name: row.last_name,
        },
      }));

      res.json({
        success: true,
        data: specialists,
      });
    } catch (error) {
      console.error("Error fetching specialists:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des spécialistes",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET SPECIALIST BY ID */
app.get(
  "/api/client/specialists/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const specialistId = parseInt(req.params.id);

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.activity_name as business_name,
          u.city,
          u.profile_photo as profile_image_url,
          u.banner_photo as cover_image_url,
          u.bio,
          u.instagram_account,
          COALESCE(AVG(r.rating), 0) as rating,
          COUNT(DISTINCT r.id) as reviews_count,
          'Prothésiste ongulaire' as specialty
        FROM users u
        LEFT JOIN reviews r ON r.pro_id = u.id
        WHERE u.id = ? AND u.role = 'pro' AND u.pro_status = 'active'
        GROUP BY u.id
        `,
        [specialistId]
      );

      if ((rows as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          message: "Spécialiste non trouvée",
        });
      }

      const row = (rows as any[])[0];
      const specialist = {
        id: row.id,
        business_name: row.business_name || `${row.first_name} ${row.last_name}`,
        specialty: row.specialty,
        city: row.city,
        rating: Number(row.rating),
        reviews_count: Number(row.reviews_count),
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
        bio: row.bio,
        instagram_account: row.instagram_account,
        user: {
          first_name: row.first_name,
          last_name: row.last_name,
        },
      };

      res.json({
        success: true,
        data: specialist,
      });
    } catch (error) {
      console.error("Error fetching specialist:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération de la spécialiste",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// ==========================================
// PAYMENT METHODS - CLIENT
// ==========================================

/* GET PAYMENT METHODS */
app.get(
  "/api/client/payment-methods",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      const [rows] = await connection.query(
        `SELECT id, brand, last4, exp_month, exp_year, cardholder_name, is_default 
         FROM payment_methods 
         WHERE user_id = ? 
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* ADD PAYMENT METHOD */
app.post(
  "/api/client/payment-methods",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const { card_number, cardholder_name, exp_month, exp_year, cvc, set_default } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      // Déterminer la marque
      let brand: "visa" | "mastercard" | "amex" = "visa";
      if (card_number.startsWith("4")) brand = "visa";
      else if (card_number.startsWith("5")) brand = "mastercard";
      else if (card_number.startsWith("3")) brand = "amex";

      const last4 = card_number.slice(-4);

      connection = await db.getConnection();

      // Si set_default, retirer le défaut des autres
      if (set_default) {
        await connection.query(
          `UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`,
          [userId]
        );
      }

      // ⚠️ STOCKAGE EN CLAIR (V1 uniquement)
      await connection.query(
        `INSERT INTO payment_methods 
         (user_id, brand, last4, exp_month, exp_year, cardholder_name, card_number, cvc, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, brand, last4, exp_month, exp_year, cardholder_name, card_number, cvc, set_default ? 1 : 0]
      );

      res.json({ success: true, message: "Carte enregistrée" });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* SET DEFAULT PAYMENT METHOD */
app.put(
  "/api/client/payment-methods/:id/default",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const cardId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      await connection.query(
        `UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`,
        [userId]
      );

      await connection.query(
        `UPDATE payment_methods SET is_default = 1 WHERE id = ? AND user_id = ?`,
        [cardId, userId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* DELETE PAYMENT METHOD */
app.delete(
  "/api/client/payment-methods/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user?.id;
      const cardId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ success: false, message: "Non authentifié" });
      }

      connection = await db.getConnection();

      await connection.query(
        `DELETE FROM payment_methods WHERE id = ? AND user_id = ?`,
        [cardId, userId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur:", error);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    } finally {
      if (connection) connection.release();
    }
  }
);

/* GET MY RESERVATIONS (CLIENT) */
app.get("/api/bookings/my-bookings", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    
    connection = await db.getConnection();
    
    const rows = await connection.query(
      `SELECT 
        r.id,
        r.pro_id,
        r.prestation_id,
        r.slot_id,
        r.status,
        r.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS pro_name,
        u.activity_name AS pro_activity_name,
        u.profile_photo AS pro_profile_photo,
        u.city AS pro_city,
        p.name AS prestation_name,
        p.price AS prestation_price,
        DATE(r.start_datetime) AS slot_date,
        TIME_FORMAT(r.start_datetime, '%H:%i') AS slot_start_time
       FROM reservations r
       LEFT JOIN users u ON u.id = r.pro_id
       LEFT JOIN prestations p ON p.id = r.prestation_id
       WHERE r.client_id = ?
       ORDER BY r.start_datetime DESC`,
      [clientId]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des réservations"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* CREATE REVIEW */
app.post("/api/reviews", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const { pro_id, rating, comment } = req.body;

    if (!pro_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Données invalides"
      });
    }

    connection = await db.getConnection();

    // Vérifier si le client a une réservation complétée avec ce pro
    const [reservation]: any = await connection.query(
      "SELECT id FROM reservations WHERE client_id = ? AND pro_id = ? AND status = 'completed' LIMIT 1",
      [clientId, pro_id]
    );

    if (!reservation) {
      return res.status(400).json({
        success: false,
        message: "Vous devez avoir une prestation complétée pour laisser un avis"
      });
    }

    // Vérifier si le client a déjà laissé un avis pour ce pro
    const [existing]: any = await connection.query(
      "SELECT id FROM reviews WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (existing) {
      // Mettre à jour l'avis existant
      await connection.query(
        "UPDATE reviews SET rating = ?, comment = ?, created_at = NOW() WHERE client_id = ? AND pro_id = ?",
        [rating, comment, clientId, pro_id]
      );
    } else {
      // Créer un nouvel avis
      await connection.query(
        "INSERT INTO reviews (client_id, pro_id, reservation_id, rating, comment) VALUES (?, ?, ?, ?, ?)",
        [clientId, pro_id, reservation.id, rating, comment]
      );
    }

    res.json({
      success: true,
      message: "Avis enregistré"
    });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'enregistrement de l'avis"
    });
  } finally {
    if (connection) connection.release();
  }
});


/* CREATE REVIEW */
app.post("/api/reviews", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const { pro_id, rating, comment } = req.body;

    if (!pro_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Données invalides"
      });
    }

    connection = await db.getConnection();

    // Vérifier si le client a déjà laissé un avis pour ce pro
    const [existing]: any = await connection.query(
      "SELECT id FROM reviews WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (existing) {
      // Mettre à jour l'avis existant
      await connection.query(
        "UPDATE reviews SET rating = ?, comment = ? WHERE client_id = ? AND pro_id = ?",
        [rating, comment, clientId, pro_id]
      );
    } else {
      // Créer un nouvel avis
      await connection.query(
        "INSERT INTO reviews (client_id, pro_id, rating, comment) VALUES (?, ?, ?, ?)",
        [clientId, pro_id, rating, comment]
      );
    }

    res.json({
      success: true,
      message: "Avis enregistré"
    });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'enregistrement de l'avis"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* ========================================
   FAVORITES ROUTES
   ======================================== */

/* GET USER FAVORITES */
app.get("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    
    connection = await db.getConnection();
    
    const rows = await connection.query(
      `SELECT 
        f.id,
        f.pro_id,
        f.created_at,
        u.first_name,
        u.last_name,
        u.activity_name,
        u.city,
        u.profile_photo,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as reviews_count
       FROM favorites f
       LEFT JOIN users u ON u.id = f.pro_id
       LEFT JOIN reviews r ON r.pro_id = f.pro_id
       WHERE f.client_id = ?
       GROUP BY f.id, f.pro_id, f.created_at, u.first_name, u.last_name, u.activity_name, u.city, u.profile_photo
       ORDER BY f.created_at DESC`,
      [clientId]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* ADD TO FAVORITES */
app.post("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const { pro_id } = req.body;

    if (!pro_id) {
      return res.status(400).json({
        success: false,
        message: "ID du professionnel requis"
      });
    }

    connection = await db.getConnection();

    // Vérifier si déjà en favori
    const [existing]: any = await connection.query(
      "SELECT id FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Déjà dans les favoris"
      });
    }

    // Ajouter aux favoris
    const result = await connection.query(
      "INSERT INTO favorites (client_id, pro_id) VALUES (?, ?)",
      [clientId, pro_id]
    );

    res.json({
      success: true,
      message: "Ajouté aux favoris",
      data: {
        id: (result as any).insertId
      }
    });
  } catch (error) {
    console.error("Error adding favorite:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'ajout aux favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* REMOVE FROM FAVORITES */
app.delete("/api/favorites/:proId", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const proId = parseInt(req.params.proId);

    if (isNaN(proId)) {
      return res.status(400).json({
        success: false,
        message: "ID invalide"
      });
    }

    connection = await db.getConnection();

    // Supprimer des favoris
    const result = await connection.query(
      "DELETE FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, proId]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Favori non trouvé"
      });
    }

    res.json({
      success: true,
      message: "Retiré des favoris"
    });
  } catch (error) {
    console.error("Error removing favorite:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* CHECK IF FAVORITE (optionnel, pour vérifier un seul pro) */
app.get("/api/favorites/check/:proId", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const proId = parseInt(req.params.proId);

    connection = await db.getConnection();

    const [favorite]: any = await connection.query(
      "SELECT id FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, proId]
    );

    res.json({
      success: true,
      data: {
        isFavorite: !!favorite
      }
    });
  } catch (error) {
    console.error("Error checking favorite:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* ========================================
   FAVORITES ROUTES
   ======================================== */

/* GET USER FAVORITES */
app.get("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    
    connection = await db.getConnection();
    
    const rows = await connection.query(
      `SELECT 
        f.id,
        f.pro_id,
        f.created_at
       FROM favorites f
       WHERE f.client_id = ?
       ORDER BY f.created_at DESC`,
      [clientId]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* ADD TO FAVORITES */
app.post("/api/favorites", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const { pro_id } = req.body;

    if (!pro_id) {
      return res.status(400).json({
        success: false,
        message: "ID du professionnel requis"
      });
    }

    connection = await db.getConnection();

    // Vérifier si déjà en favori
    const [existing]: any = await connection.query(
      "SELECT id FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, pro_id]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Déjà dans les favoris"
      });
    }

    // Ajouter aux favoris
    const result = await connection.query(
      "INSERT INTO favorites (client_id, pro_id) VALUES (?, ?)",
      [clientId, pro_id]
    );

    res.json({
      success: true,
      message: "Ajouté aux favoris",
      data: {
        id: (result as any).insertId
      }
    });
  } catch (error) {
    console.error("Error adding favorite:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'ajout aux favoris"
    });
  } finally {
    if (connection) connection.release();
  }
});

/* REMOVE FROM FAVORITES */
app.delete("/api/favorites/:proId", authenticateToken, async (req: Request, res: Response) => {
  let connection;
  try {
    const clientId = (req as any).user.userId;
    const proId = parseInt(req.params.proId);

    if (isNaN(proId)) {
      return res.status(400).json({
        success: false,
        message: "ID invalide"
      });
    }

    connection = await db.getConnection();

    const result = await connection.query(
      "DELETE FROM favorites WHERE client_id = ? AND pro_id = ?",
      [clientId, proId]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Favori non trouvé"
      });
    }

    res.json({
      success: true,
      message: "Retiré des favoris"
    });
  } catch (error) {
    console.error("Error removing favorite:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression"
    });
  } finally {
    if (connection) connection.release();
  }
});





// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
