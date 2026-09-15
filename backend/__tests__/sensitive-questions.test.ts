/**
 * Tests — détection assistée par mots-clés (moteur de prestations V2).
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9.2).
 */

import { describe, it, expect } from "vitest";
import {
  detectSensitiveKeywords,
  PROVISIONAL_SENSITIVE_KEYWORDS,
  getSensitiveAnswerRetentionDays,
  DEFAULT_SENSITIVE_ANSWER_RETENTION_DAYS,
} from "../lib/sensitive-questions";

describe("detectSensitiveKeywords", () => {
  it("détecte un mot-clé évident (santé)", () => {
    expect(detectSensitiveKeywords("As-tu un problème de santé à signaler ?")).toContain("santé");
  });

  it("détecte un mot-clé indépendamment des accents et de la casse", () => {
    expect(detectSensitiveKeywords("ES-TU ENCEINTE ?")).toContain("enceinte");
    expect(detectSensitiveKeywords("Une allergie connue ?")).toContain("allergie");
  });

  it("ne suggère rien pour une question non sensible", () => {
    expect(detectSensitiveKeywords("Quelle forme préfères-tu ?")).toEqual([]);
  });

  it("ne décide jamais seule — retourne une liste, jamais un booléen forcé", () => {
    const matches = detectSensitiveKeywords("Traitement en cours ?");
    expect(Array.isArray(matches)).toBe(true);
    expect(PROVISIONAL_SENSITIVE_KEYWORDS).toContain("traitement");
  });
});

describe("getSensitiveAnswerRetentionDays", () => {
  it("retourne la valeur par défaut si aucune variable d'env n'est définie", () => {
    delete process.env.SENSITIVE_ANSWER_RETENTION_DAYS;
    expect(getSensitiveAnswerRetentionDays()).toBe(DEFAULT_SENSITIVE_ANSWER_RETENTION_DAYS);
  });

  it("respecte la variable d'env si définie et valide", () => {
    process.env.SENSITIVE_ANSWER_RETENTION_DAYS = "365";
    expect(getSensitiveAnswerRetentionDays()).toBe(365);
    delete process.env.SENSITIVE_ANSWER_RETENTION_DAYS;
  });

  it("retombe sur la valeur par défaut si la variable d'env est invalide", () => {
    process.env.SENSITIVE_ANSWER_RETENTION_DAYS = "not-a-number";
    expect(getSensitiveAnswerRetentionDays()).toBe(DEFAULT_SENSITIVE_ANSWER_RETENTION_DAYS);
    delete process.env.SENSITIVE_ANSWER_RETENTION_DAYS;
  });
});
