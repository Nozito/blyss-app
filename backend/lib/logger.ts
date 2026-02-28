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
    message,
    ...(context ? { ctx: sanitize(context) } : {}),
  });
}

function error(route: string, message: string, stack?: string): void {
  emit({
    ts: new Date().toISOString(),
    level: "error",
    route,
    message,
    ...(stack ? { stack: stack.slice(0, 500) } : {}),
  });
}

/** Remove PII-sensitive keys from a context object before logging. */
function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const BLOCKED = new Set([
    "email", "password", "password_hash", "iban", "IBAN", "token",
    "access_token", "refresh_token", "authorization", "cookie",
    "first_name", "last_name", "phone_number", "birth_date",
  ]);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !BLOCKED.has(key.toLowerCase()))
  );
}

export const log = { info, warn, error };
