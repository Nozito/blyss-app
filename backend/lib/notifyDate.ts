/**
 * Shared date/time formatting for user-facing notification text.
 *
 * Every notification that names a specific appointment slot must read it
 * the way a person would say it out loud — "lundi 10 août à 12h30" — never
 * a raw ISO string, a slash-separated numeric date, or "12:30" with a colon.
 */

const WEEKDAY_TIME_ZONE = "Europe/Paris";

/** "lundi 10 août" — no year (every caller is a near-term notification). */
export function formatRdvDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    timeZone: WEEKDAY_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "12h30" (or "12h00", never just "12h") — not "12:30". */
export function formatRdvTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: WEEKDAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}h${minute}`;
}

/** "lundi 10 août à 12h30" — the one form notification copy should use. */
export function formatRdvWhen(date: Date): string {
  return `${formatRdvDate(date)} à ${formatRdvTime(date)}`;
}

/** "45,00" — French decimal comma, matching how prices already render
 * elsewhere in the app (e.g. the mobile agenda's AptCard). `.toFixed(2)`
 * alone leaves an unlocalized "45.00" in French-language notification text. */
export function formatEuros(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}
