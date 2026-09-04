/**
 * Tests bout-en-bout de lib/totp — AUCUN mock.
 *
 * Objectif : dé-risquer ce que les tests d'intégration (qui stubbent
 * verifyTotpToken) ne prouvent pas — que la vraie chaîne otplib + AES-256-GCM
 * + bcrypt fonctionne comme un authenticator réel le ferait.
 */

import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpToken,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  matchBackupCode,
} from "../lib/totp";
import { generate as otpGenerate } from "otplib";

describe("lib/totp — chaîne réelle", () => {
  it("secret → URI otpauth:// standard → code → verify OK", async () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/); // base32

    const uri = totpKeyUri(secret, "admin-test@blyssapp.fr");
    expect(uri).toMatch(/^otpauth:\/\/totp\/Blyss%20Admin:admin-test%40blyssapp\.fr\?/);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=Blyss%20Admin");

    // Ce que produirait Google Authenticator / Authy pour ce secret, maintenant.
    const code = await otpGenerate({ secret });
    expect(await verifyTotpToken(secret, code)).toBe(true);
  });

  it("rejette un code faux et un code hors fenêtre", async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotpToken(secret, "000000")).toBe(false);
    expect(await verifyTotpToken(secret, "abcdef")).toBe(false);
    expect(await verifyTotpToken("", "000000")).toBe(false);
  });

  it("secret chiffré AES-256-GCM : round-trip, IV unique, déchiffrement authentifié", () => {
    const secret = generateTotpSecret();
    const a = encryptTotpSecret(secret);
    const b = encryptTotpSecret(secret);
    expect(a.iv).not.toBe(b.iv); // IV aléatoire par enregistrement
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptTotpSecret(a.ciphertext, a.iv)).toBe(secret);

    // authTag corrompu → throw (jamais un secret silencieusement faux)
    const tampered = a.ciphertext.slice(0, -2) + (a.ciphertext.endsWith("00") ? "11" : "00");
    expect(() => decryptTotpSecret(tampered, a.iv)).toThrow();
  });

  it("un secret chiffré est bien vérifiable après déchiffrement (parcours confirm/verify)", async () => {
    const secret = generateTotpSecret();
    const { ciphertext, iv } = encryptTotpSecret(secret);
    const restored = decryptTotpSecret(ciphertext, iv);
    const code = await otpGenerate({ secret: restored });
    expect(await verifyTotpToken(restored, code)).toBe(true);
  });

  it("codes de secours : 8 codes uniques, hashés, à usage unique", async () => {
    const { plain, hashed } = await generateBackupCodes();
    expect(plain).toHaveLength(8);
    expect(new Set(plain).size).toBe(8);
    expect(plain.every((c) => /^[0-9A-F]{6}-[0-9A-F]{6}$/.test(c))).toBe(true);
    expect(hashed.every((h) => h.startsWith("$2"))).toBe(true); // bcrypt
    expect(hashed).not.toContain(plain[0]); // jamais en clair

    // match sur le bon code, insensible à la casse (route: code.trim().toUpperCase())
    expect(await matchBackupCode(plain[3], hashed)).toBe(3);
    expect(await matchBackupCode("ZZZZZZ-ZZZZZZ", hashed)).toBe(-1);

    // après consommation (retrait de l'index 3) : le code ne matche plus
    const remaining = hashed.filter((_, i) => i !== 3);
    expect(await matchBackupCode(plain[3], remaining)).toBe(-1);
    expect(await matchBackupCode(plain[4], remaining)).toBe(3);
  });
});
