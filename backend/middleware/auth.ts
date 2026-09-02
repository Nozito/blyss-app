import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../lib/types";
import { jwtVerifyOpts } from "../lib/tokens";

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, jwtVerifyOpts) as {
      id: number;
      purpose?: string;
    };
    // Les tokens d'accès légitimes (generateAccessToken) ne portent JAMAIS de
    // claim `purpose`. Un token intermédiaire — challenge 2FA
    // (`purpose: "2fa_challenge"`, émis AVANT la vérification TOTP) — est signé
    // avec le même JWT_SECRET : sans ce contrôle, il serait accepté ici comme
    // un token d'accès et permettrait de contourner entièrement la 2FA admin.
    if (decoded.purpose) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    req.user = { id: decoded.id };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

export const authenticateToken = authMiddleware;
