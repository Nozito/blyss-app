import crypto from "crypto";

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (!_key) {
    if (!process.env.IBAN_ENC_KEY) throw new Error("IBAN_ENC_KEY manquante");
    _key = Buffer.from(process.env.IBAN_ENC_KEY, "hex");
    if (_key.length !== 32) throw new Error("IBAN_ENC_KEY doit être 32 octets (64 hex chars)");
  }
  return _key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM with a fresh random 12-byte IV.
 * Self-contained format: `${iv_hex}:${ciphertext_base64}:${tag_hex}`
 * Used for fields stored in a single column (e.g. bankaccountname).
 */
export function encryptSensitiveData(plain: string): string {
  if (!plain || plain.trim() === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("base64")}:${tag.toString("hex")}`;
}

/**
 * Decrypt a value encrypted by encryptSensitiveData.
 * Accepts the self-contained `iv_hex:ciphertext_base64:tag_hex` format.
 */
export function decryptSensitiveData(stored: string): string {
  if (!stored || stored.trim() === "") return "";
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Format chiffrement invalide (attendu: iv:ciphertext:tag)");
  const [ivHex, ciphertextB64, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt an IBAN using AES-256-GCM with a fresh random IV.
 * Returns separate {ciphertext, iv, tag} to be stored in distinct DB columns:
 *   IBAN (TEXT), iban_iv (VARCHAR 64), iban_tag (VARCHAR 64)
 */
export function encryptIban(plain: string): { ciphertext: string; iv: string; tag: string } {
  if (!plain || plain.trim() === "") {
    return { ciphertext: "", iv: "", tag: "" };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypt an IBAN encrypted by encryptIban.
 * Accepts the three separate column values (ciphertext, iv, tag).
 */
export function decryptIban(ciphertext: string, iv: string, tag: string): string {
  if (!ciphertext || !iv || !tag) return "";
  const ivBuf = Buffer.from(iv, "hex");
  const ciphertextBuf = Buffer.from(ciphertext, "base64");
  const tagBuf = Buffer.from(tag, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), ivBuf);
  decipher.setAuthTag(tagBuf);
  const decrypted = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
  return decrypted.toString("utf8");
}
