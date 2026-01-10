import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { isValidIBAN, electronicFormatIBAN } from 'ibantools';
import crypto from 'crypto';



const envFile = process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev';

const envPath = path.resolve(__dirname, '..', envFile);
console.log('Loading env from:', envPath);

dotenv.config({
  path: envPath,
});

console.log('JWT_SECRET after dotenv =', process.env.JWT_SECRET);

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
  'http://localhost:5173',
  'http://localhost:8080',
  'https://app.blyssapp.fr'
];

const IBAN_KEY = Buffer.from(process.env.IBAN_ENC_KEY || '', 'hex');
const IBAN_IV = Buffer.from(process.env.IBAN_ENC_IV || '', 'hex');

if (IBAN_KEY.length !== 32) {
  console.error('IBAN_ENC_KEY must be 32 bytes (64 hex chars).');
  process.exit(1);
}
if (![12, 16].includes(IBAN_IV.length)) {
  console.error('IBAN_ENC_IV must be 12 or 16 bytes.');
  process.exit(1);
}

function encryptIban(plain: string): string {
  const cipher = crypto.createCipheriv('aes-256-gcm', IBAN_KEY, IBAN_IV);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // on stocke ciphertext + tag en base64, séparés
  return `${encrypted.toString('base64')}:${authTag.toString('base64')}`;
}

function decryptIban(stored: string): string {
  const [cipherTextB64, tagB64] = stored.split(':');
  const encrypted = Buffer.from(cipherTextB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', IBAN_KEY, IBAN_IV);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

const authMiddleware = (req: AuthenticatedRequest, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  console.log("Auth header:", authHeader); // debug

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
  startDate: string; // "YYYY-MM-DD"
  endDate?: string | null;
}


app.post("/api/auth/signup", async (req: Request<{}, {}, SignupRequestBody>, res: Response) => {
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
      return res.status(400).json({ success: false, message: "Missing required fields: email and password" });
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
    res.status(500).json({ success: false, message: "Signup failed due to server error" });
  }
});

app.post("/api/auth/login", async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "missing_fields" });
    }

    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    const user = (rows as User[])[0];

    if (!user) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ success: false, error: "invalid_password" });
    }

    const { password_hash, ...userWithoutPassword } = user;

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      data: {
        token: token,
        user: userWithoutPassword,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "login_failed" });
  }
});

// Récupérer l'utilisateur connecté
app.get("/api/users", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [rows] = await db.execute("SELECT * FROM users WHERE id = ?", [req.user.id]);
    const user = (rows as User[])[0];
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Ne jamais renvoyer le hash de mot de passe
    const { password_hash, ...userWithoutPassword } = user;

    res.json({ success: true, data: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Unable to fetch user" });
  }
});

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

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG and PNG files are allowed"));
  }
};

const upload = multer({ storage, fileFilter });

app.post("/api/users/upload-photo", authMiddleware, upload.single("photo"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file || !req.user?.id) {
      return res.status(400).json({ success: false, message: "No file or userId provided" });
    }

    const photoPath = `/uploads/profile_photo/${req.file.filename}`;

    await db.execute(
      "UPDATE users SET profile_photo = ? WHERE id = ?",
      [photoPath, req.user.id]
    );

    res.json({ success: true, photo: photoPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

app.put("/api/users/update", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

    const [rows] = await db.execute("SELECT * FROM users WHERE id = ?", [req.user!.id]);
    const user = (rows as User[])[0];

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let passwordHash = user.password_hash;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password required" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ success: false, message: "Invalid current password" });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must be different from current password",
        });
      }
      passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updatedFirstName = first_name !== undefined ? first_name : user.first_name;
    const updatedLastName = last_name !== undefined ? last_name : user.last_name;
    const updatedActivityName = user.role === "pro" ? (activity_name !== undefined ? activity_name : user.activity_name) : null;
    const updatedCity = user.role === "pro" ? (city !== undefined ? city : user.city) : null;
    const updatedInstagramAccount = user.role === "pro" ? (instagram_account !== undefined ? instagram_account : user.instagram_account) : null;

    await db.execute(
      `UPDATE users
       SET first_name = ?, last_name = ?, activity_name = ?, city = ?, instagram_account = ?, password_hash = ?
       WHERE id = ?`,
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

    const [updatedRows] = await db.execute("SELECT * FROM users WHERE id = ?", [req.user!.id]);
    const updatedUser = (updatedRows as User[])[0];
    const { password_hash, ...userWithoutPassword } = updatedUser;

    res.json({ success: true, data: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

// Création d'un abonnement pro + activation pro_status
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
        endDate
      } = req.body as CreateSubscriptionBody;

      if (!plan || !billingType || !monthlyPrice || !startDate) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields"
        });
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        // 1) Insert dans subscriptions
        const [result] = await connection.execute(
          `
          INSERT INTO subscriptions
            (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `,
          [
            req.user.id,
            plan,
            billingType,
            monthlyPrice,
            totalPrice ?? null,
            commitmentMonths ?? null,
            startDate,
            endDate ?? null
          ]
        );

        // 2) Passer l'utilisateur en pro_status = 'active'
        await connection.execute(
          `UPDATE users SET pro_status = 'active' WHERE id = ?`,
          [req.user.id]
        );

        await connection.commit();

        // @ts-ignore
        const subscriptionId = (result as any).insertId;

        res.status(201).json({
          success: true,
          data: { subscriptionId }
        });
      } catch (err) {
        await connection.rollback();
        console.error("Error creating subscription:", err);
        res.status(500).json({
          success: false,
          message: "Failed to create subscription"
        });
      } finally {
        connection.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
);


app.put('/api/users/payments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { bankaccountname, IBAN, accept_online_payment } = req.body as UpdatePaymentsBody;

    if (accept_online_payment) {
      if (!bankaccountname || !bankaccountname.trim()) {
        return res.status(400).json({ success: false, message: 'Le titulaire du compte est requis.' });
      }
      if (!IBAN || !IBAN.trim()) {
        return res.status(400).json({ success: false, message: 'L’IBAN est requis.' });
      }

      const formattedIban = electronicFormatIBAN(IBAN);
      if (!isValidIBAN(formattedIban)) {
        return res.status(400).json({ success: false, message: 'IBAN invalide.' });
      }

      // Chiffrement IBAN
      const encryptedIban = encryptIban(formattedIban);

      // Vérifier unicité : soit tu laisses la contrainte MySQL faire le boulot,
      // soit tu testes toi-même sur la colonne chiffrée (unique_user_iban) :
      const [existing] = await db.execute(
        'SELECT id FROM users WHERE IBAN = ? AND id != ?',
        [encryptedIban, userId]
      );
      if ((existing as any[]).length > 0) {
        return res.status(409).json({ success: false, message: 'Cet IBAN est déjà utilisé par un autre compte.' });
      }

      await db.execute(
        `
          UPDATE users
          SET bankaccountname = ?, IBAN = ?, accept_online_payment = 1
          WHERE id = ?
        `,
        [bankaccountname.trim(), encryptedIban, userId]
      );
    } else {
      // Pas de paiement en ligne
      await db.execute(
        `
          UPDATE users
          SET accept_online_payment = 0
          WHERE id = ?
        `,
        [userId]
      );
    }

    // Retourner les infos mises à jour (sans déchiffrer IBAN côté API si tu ne veux pas)
    const [rows] = await db.execute(
      'SELECT bankaccountname, IBAN, accept_online_payment FROM users WHERE id = ?',
      [userId]
    );
    const record = (rows as any[])[0];

    // Pour ne pas exposer l’IBAN brut chiffré, tu peux renvoyer null ou une version masquée
    let maskedIban: string | null = null;
    if (record.IBAN) {
      try {
        const plain = decryptIban(record.IBAN as string);
        maskedIban = plain.replace(/.(?=.{4})/g, '•'); // masque tout sauf les 4 derniers
      } catch {
        maskedIban = null;
      }
    }

    res.json({
      success: true,
      data: {
        bankaccountname: record.bankaccountname,
        IBAN: maskedIban,
        accept_online_payment: record.accept_online_payment,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour des paiements.' });
  }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// --- DASHBOARD PRO ---

// helper pour récupérer l'id du pro connecté depuis ton authMiddleware
function getProId(req: AuthenticatedRequest): number {
  const proId = req.user?.id;
  if (!proId) {
    throw new Error("Pro non authentifié");
  }
  return proId;
}

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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});