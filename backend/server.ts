import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

// 🔐 SIGNUP
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
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: "Signup failed due to server error" });
    }
});

// 🔑 LOGIN with debug logs and typed responses
app.post("/api/auth/login", async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: "missing_fields" });
        }

        const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
        const user = (rows as User[])[0];

        if (!user) {
            return res.status(200).json({ success: false, error: "user_not_found" });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(200).json({ success: false, error: "invalid_password" });
        }

        // Return user info excluding password_hash
        const { password_hash, ...userWithoutPassword } = user;

        res.json({ success: true, data: { user: userWithoutPassword, role: user.role } });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, error: "login_failed" });
    }
});

// Configurer le dossier de stockage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads/profile_photo"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${req.body.userId}_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

app.post("/api/users/upload-photo", upload.single("photo"), async (req, res) => {
  try {
    console.log("Received userId:", req.body.userId);
    console.log("Received file:", req.file);
    if (!req.file || !req.body.userId) {
      return res.status(400).json({ success: false, message: "No file or userId provided" });
    }

    const photoPath = `/uploads/profile_photo/${req.file.filename}`;

    const [result] = await db.execute(
      "UPDATE users SET profile_photo = ? WHERE id = ?",
      [photoPath, req.body.userId]
    );

    console.log("Photo upload result:", result);

res.json({ success: true, photo: photoPath });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
    console.log("Received body:", req.body);
  }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.listen(3001, () => {
    console.log("🚀 Backend running on http://localhost:3001");
});