/**
 * Détection assistée par mots-clés + texte de consentement — questions
 * sensibles du moteur de prestations V2.
 *
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9.2, décision
 * verrouillée §0.5) : la détection SUGGÈRE, ne décide jamais seule — la pro
 * confirme/infirme explicitement le flag `is_sensitive` à la création de la
 * question (doc §9.2). Ce module ne prend aucune décision juridique.
 *
 * ⚠️ CONTENU PROVISOIRE — la liste de mots-clés et le texte de consentement
 * ci-dessous ne sont PAS validés juridiquement. Ils existent pour que le
 * mécanisme (flag + suggestion + consentement dédié + rétention) soit
 * développé et testable dès maintenant, conformément à la décision du
 * fondateur (2026-09-15) : "le développement doit permettre de configurer/
 * brancher ces éléments sans figer arbitrairement un texte juridique
 * présenté comme définitif". Le contenu final sera fourni avant la mise en
 * production publique de V2 — remplacer ces deux exports à ce moment-là,
 * aucun autre changement de code requis (servis dynamiquement au mobile,
 * jamais codés en dur côté app).
 */

/** Liste PROVISOIRE — à remplacer avant mise en prod publique V2. */
export const PROVISIONAL_SENSITIVE_KEYWORDS: readonly string[] = [
  "allergie",
  "allergique",
  "santé",
  "médical",
  "medicale",
  "maladie",
  "grossesse",
  "enceinte",
  "traitement",
  "handicap",
  "pathologie",
];

/**
 * Suggère si un libellé de question évoque un sujet sensible — jamais une
 * décision automatique, uniquement une aide à la saisie côté pro (doc §9.2).
 */
function stripAccents(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function detectSensitiveKeywords(label: string): string[] {
  const normalized = stripAccents(label);
  // Les deux côtés de la comparaison sont désaccentués : la liste contient
  // volontairement les mots-clés accentués (lisibilité du code), mais le
  // matching doit être insensible aux accents (bug trouvé en test : "santé"
  // ne matchait jamais "sante" après normalisation du seul label).
  return PROVISIONAL_SENSITIVE_KEYWORDS.filter((kw) => normalized.includes(stripAccents(kw)));
}

/**
 * Texte de consentement PROVISOIRE affiché à la cliente avant de répondre à
 * une question marquée sensible. Servi dynamiquement (jamais codé en dur
 * côté mobile) pour pouvoir être remplacé sans nouvelle version d'app.
 */
export const PROVISIONAL_SENSITIVE_CONSENT_TEXT =
  "[Texte provisoire — non validé juridiquement] Cette question porte sur une donnée personnelle sensible. " +
  "En répondant, tu acceptes que cette information soit communiquée à la professionnelle dans le cadre de ta prestation.";

/** Durée de rétention PROVISOIRE (jours) avant anonymisation des réponses sensibles. Configurable, non figée. */
export const DEFAULT_SENSITIVE_ANSWER_RETENTION_DAYS = 730; // ~24 mois — provisoire, cf. commentaire de fichier

export function getSensitiveAnswerRetentionDays(): number {
  const fromEnv = Number(process.env.SENSITIVE_ANSWER_RETENTION_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_SENSITIVE_ANSWER_RETENTION_DAYS;
}
