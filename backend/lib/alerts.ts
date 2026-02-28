/**
 * Alert system — sends warnings/critical alerts.
 *
 * - Dev: console.warn / console.error
 * - Prod: POST to ALERT_WEBHOOK_URL (Slack/Discord compatible)
 * - 5xx surge detection: > 10 errors in 5 minutes → critical alert
 */

const IS_PROD = process.env.NODE_ENV === "production";
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

// In-memory counter: minute bucket → count of 5xx errors
const fivexxBuckets = new Map<number, number>();
const FIVE_MIN_MS = 5 * 60 * 1000;
const SURGE_THRESHOLD = 10;
let surgeAlerted = false;

function minuteBucket(): number {
  return Math.floor(Date.now() / 60_000);
}

/** Record a 5xx error and send critical alert if threshold exceeded. */
export function track5xx(): void {
  const bucket = minuteBucket();
  fivexxBuckets.set(bucket, (fivexxBuckets.get(bucket) ?? 0) + 1);

  // Cleanup buckets older than 5 minutes
  const cutoff = bucket - 5;
  for (const key of fivexxBuckets.keys()) {
    if (key < cutoff) fivexxBuckets.delete(key);
  }

  // Sum over last 5 buckets
  let total = 0;
  for (const [k, v] of fivexxBuckets) {
    if (k >= cutoff) total += v;
  }

  if (total > SURGE_THRESHOLD && !surgeAlerted) {
    surgeAlerted = true;
    sendAlert("critical", `5xx surge: ${total} errors in last 5 minutes`).catch(() => {});
    // Reset after 10 minutes to allow re-alerting
    setTimeout(() => { surgeAlerted = false; }, 10 * 60 * 1000);
  }
}

export async function sendAlert(
  level: "warn" | "critical",
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "development",
    ...(context ? { context } : {}),
  };

  if (!IS_PROD || !WEBHOOK_URL) {
    // Dev: just log to stderr
    if (level === "critical") {
      console.error("[ALERT:CRITICAL]", message, context ?? "");
    } else {
      console.warn("[ALERT:WARN]", message, context ?? "");
    }
    return;
  }

  try {
    // Slack/Discord webhook compatible format
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${level.toUpperCase()}] ${message}`,
        attachments: [
          {
            color: level === "critical" ? "danger" : "warning",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      }),
    });
  } catch {
    // Never throw from alert — log to stderr as last resort
    console.error("[ALERT] Failed to send webhook alert:", message);
  }
}
