import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDb } from "./db";

// Algorithme + issuer + audience explicites, partagés par TOUS les jwt.sign /
// jwt.verify du backend (middleware/auth, server WS, routes/auth). Sans
// `algorithms` au verify, un token forgé en `alg: none` ou via confusion
// RS256/HS256 serait accepté ; sans `issuer`/`audience`, un token émis par un
// autre service partageant par erreur le secret, ou réutilisé hors contexte,
// passerait aussi.
//
// NB : un token émis AVANT cette version (sans iss/aud) est rejeté au premier
// appel — les access tokens (15 min) se renouvellent via le refresh opaque,
// le challenge 2FA (5 min) se refait, le WS se reconnecte.
export const JWT_ALGO = "HS256" as const;
export const JWT_ISSUER = "blyss-api" as const;
export const JWT_AUDIENCE = "blyss-app" as const;

export const jwtSignOpts: jwt.SignOptions = {
  algorithm: JWT_ALGO,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

export const jwtVerifyOpts: jwt.VerifyOptions = {
  algorithms: [JWT_ALGO],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

export function generateAccessToken(userId: number): string {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { ...jwtSignOpts, expiresIn: "15m" });
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
