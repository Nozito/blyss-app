import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDb } from "./db";

export function generateAccessToken(userId: number): string {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a refresh token, stores only its SHA-256 hash (never the raw
 * value — matching the password_reset_tokens pattern), and returns the raw
 * token to send to the client.
 */
export async function generateAndStoreRefreshToken(userId: number): Promise<string> {
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await getDb().execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES (?, ?, ?, false)`,
    [userId, hashToken(refreshToken), expiresAt]
  );

  return refreshToken;
}

export interface RefreshTokenRecord {
  user_id: number;
  expires_at: string;
  revoked: boolean;
}

/** Looks up a raw refresh token by hashing it and matching against token_hash. */
export async function findRefreshToken(rawToken: string): Promise<RefreshTokenRecord | null> {
  const [rows] = await getDb().execute(
    `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
    [hashToken(rawToken)]
  );
  return (rows as RefreshTokenRecord[])[0] ?? null;
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await getDb().execute(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = ?`,
    [hashToken(rawToken)]
  );
}
