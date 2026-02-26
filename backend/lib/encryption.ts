import crypto from "crypto";

let _key: Buffer | null = null;
let _iv: Buffer | null = null;

function getKey(): Buffer {
  if (!_key) {
    if (!process.env.IBAN_ENC_KEY) throw new Error("IBAN_ENC_KEY manquante");
    _key = Buffer.from(process.env.IBAN_ENC_KEY, "hex");
    if (_key.length !== 32) throw new Error("IBAN_ENC_KEY doit être 32 octets (64 hex chars)");
  }
  return _key;
}

function getIv(): Buffer {
  if (!_iv) {
    if (!process.env.IBAN_ENC_IV) throw new Error("IBAN_ENC_IV manquante");
    _iv = Buffer.from(process.env.IBAN_ENC_IV, "hex");
    if (![12, 16].includes(_iv.length)) throw new Error("IBAN_ENC_IV doit être 12 ou 16 octets");
  }
  return _iv;
}

export function encryptSensitiveData(plain: string): string {
  if (!plain || plain.trim() === "") return "";
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), getIv());
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decryptSensitiveData(stored: string): string {
  if (!stored || stored.trim() === "") return "";
  const [cipherTextB64, tagB64] = stored.split(":");
  if (!cipherTextB64 || !tagB64) throw new Error("Invalid encrypted data format");
  const encrypted = Buffer.from(cipherTextB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), getIv());
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export const encryptIban = encryptSensitiveData;
export const decryptIban = decryptSensitiveData;
