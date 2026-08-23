import crypto from "crypto";
import bcrypt from "bcrypt";
import { generateSecret, generateURI, verify } from "otplib";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.TOTP_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOTP_ENC_KEY manquante ou invalide (attendu : 64 caractères hex / 32 octets)");
  }
  return Buffer.from(hex, "hex");
}

/** Chiffre un secret TOTP en clair. Retourne {ciphertext, iv} — l'IV+authTag sont stockés à part (jamais réutilisés). */
export function encryptTotpSecret(plainSecret: string): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // ciphertext = données chiffrées + authTag concaténés (16 derniers octets = authTag)
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("hex"),
    iv: iv.toString("hex"),
  };
}

export function decryptTotpSecret(ciphertextHex: string, ivHex: string): string {
  const raw = Buffer.from(ciphertextHex, "hex");
  const authTag = raw.subarray(raw.length - 16);
  const encrypted = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpKeyUri(secret: string, email: string): string {
  return generateURI({ issuer: "Blyss Admin", label: email, secret });
}

export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

/** Génère 8 codes de secours lisibles (ex: "7F3K-9QRT") + leurs hash bcrypt à stocker. */
export async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < 8; i++) {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    plain.push(`${part1}-${part2}`);
  }
  const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
  return { plain, hashed };
}

/** Vérifie un code de secours contre la liste hashée ; retourne l'index consommé ou -1. */
export async function matchBackupCode(code: string, hashedCodes: string[]): Promise<number> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) return i;
  }
  return -1;
}
