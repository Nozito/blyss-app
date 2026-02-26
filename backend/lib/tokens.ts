import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDb } from "./db";

export function generateAccessToken(userId: number): string {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

export async function generateAndStoreRefreshToken(userId: number): Promise<string> {
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await getDb().execute(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, revoked) VALUES (?, ?, ?, 0)`,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await getDb().execute(
    `UPDATE refresh_tokens SET revoked = 1 WHERE token = ?`,
    [token]
  );
}
