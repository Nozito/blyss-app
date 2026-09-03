/**
 * Résolution d'un contact "exact" fourni par la pro pour rattacher une walk-in
 * à un compte client existant, SANS recherche par nom / fragment.
 *
 * RGPD : ce chemin est la seule exception au filtrage par relation
 * (réservation confirmed/completed). Il exige que la pro connaisse déjà
 * l'email ou le téléphone exact de la cliente — pas d'énumération possible.
 *
 * Les numéros ne sont pas normalisés en base : la comparaison se fait donc
 * "sans séparateurs" des deux côtés (espaces, points, tirets, parenthèses
 * retirés ; le "+" initial est conservé). Un `0X…` ne matchera pas un
 * `+33X…` stocké — c'est volontaire : correspondance stricte de ce que la
 * pro saisit vs ce qui est enregistré.
 */

export type ContactMatch =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

/** Forme d'email pragmatique — on ne cherche pas à tout valider, juste à
 * écarter un fragment de nom qui contiendrait un "@" par accident. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Retire tout sauf chiffres et un éventuel "+" (n'importe où, on garde). */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Classe une saisie en email OU téléphone exploitable, ou `null` si la saisie
 * ne ressemble ni à l'un ni à l'autre (nom, fragment, chaîne vide…).
 */
export function classifyContact(raw: unknown): ContactMatch | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 255) return null;

  if (s.includes("@")) {
    if (!EMAIL_RE.test(s)) return null;
    return { kind: "email", value: normalizeEmail(s) };
  }

  const digits = normalizePhone(s).replace(/^\+?/, "").replace(/\+/g, "");
  // Un vrai numéro : 6 à 15 chiffres (E.164 max). En dessous = pas un téléphone.
  if (digits.length < 6 || digits.length > 15) return null;
  return { kind: "phone", value: normalizePhone(s) };
}
