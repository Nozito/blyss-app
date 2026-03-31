import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../lib/types";

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Cookie first (browser clients), then Authorization header (API clients / tests)
  const cookieToken: string | undefined = req.cookies?.access_token;
  const authHeader = req.headers.authorization;

  let token: string | undefined = cookieToken;
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    req.user = { id: decoded.id };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

export const authenticateToken = authMiddleware;
