/**
 * Structured JSON logger — no PII in logs.
 *
 * Rules:
 * - Output: JSON lines { ts, level, route, status?, ms?, uid? }
 * - Never log email, name, IBAN, full token, or req.body
 * - userId is logged as a numeric ID only (never email)
 */

type Level = "info" | "warn" | "error";

function emit(record: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(record) + "\n");
}

function info(route: string, statusCode: number, durationMs: number, userId?: number): void {
  emit({
    ts: new Date().toISOString(),
    level: "info",
    route,
    status: statusCode,
    ms: durationMs,
    ...(userId !== undefined ? { uid: userId } : {}),
  });
}

function warn(route: string, message: string, context?: Record<string, unknown>): void {
  emit({
    ts: new Date().toISOString(),
    level: "warn",
    route,
    message: scrub(message),
    ...(context ? { ctx: sanitize(context) } : {}),
  });
}

function error(route: string, message: string, stack?: string): void {
  emit({
    ts: new Date().toISOString(),
    level: "error",
    route,
    message: scrub(message),
    ...(stack ? { stack: scrub(stack.slice(0, 500)) } : {}),
  });
}

const BLOCKED_KEYS = new Set([
  "email", "password", "password_hash", "iban", "token",
  "access_token", "refresh_token", "authorization", "cookie",
  "first_name", "last_name", "phone_number", "birth_date",
]);

/** Neutralise les sauts de ligne / caractères de contrôle (anti log-injection). */
function scrub(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, " ");
}

/**
 * Retire les clés PII-sensibles et neutralise les valeurs texte, en profondeur
 * (objets et tableaux imbriqués — sinon un payload `{ user: { email } }`
 * passait au travers).
 */
function sanitize(value: unknown): unknown {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !BLOCKED_KEYS.has(key.toLowerCase()))
        .map(([key, v]) => [key, sanitize(v)])
    );
  }
  return value;
}

export const log = { info, warn, error };
