import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../lib/types";

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Auth: No token provided");
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    console.log("✅ Auth: Token decoded, userId:", decoded.id);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    console.error("❌ Auth: JWT error:", err);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

export const authenticateToken = authMiddleware;
