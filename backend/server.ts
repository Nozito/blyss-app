import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";

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
app.use(cors({
    origin: "http://localhost:8080",
    credentials: true
}));

const allowedOrigins = [
  'http://localhost:5173',      
  'http://localhost:8080',      
  'https://app.blyssapp.fr'     
];

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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        console.error(err);
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
                token : token,
                user: userWithoutPassword,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "login_failed" });
    }
});

// Récupérer l'utilisateur connecté
app.get("/api/users", authMiddleware, async (req: any, res: Response) => {
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});