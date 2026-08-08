import http2 from "node:http2";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

// Live Activity push (iOS ActivityKit) — direct APNs client via HTTP/2 +
// a provider auth token (JWT signed with the .p8 key), no third-party APNs
// package: node:http2 + jsonwebtoken (already a dependency) cover the whole
// protocol, avoiding an extra dependency for what's a handful of requests.
//
// Docs: https://developer.apple.com/documentation/usernotifications/sending-live-activity-updates

const APNS_BUNDLE_ID = process.env.APNS_TOPIC ?? "blyss.app";
const LIVE_ACTIVITY_TOPIC = `${APNS_BUNDLE_ID}.push-type.liveactivity`;
const APNS_HOST =
  process.env.APNS_ENVIRONMENT === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";

// Apple asks providers not to mint a fresh token more than once every ~20min;
// tokens stay valid up to 1h.
const TOKEN_TTL_SECONDS = 20 * 60;

let cachedToken: { token: string; issuedAt: number } | undefined;

function loadPrivateKey(): string | undefined {
  if (process.env.APNS_PRIVATE_KEY) return process.env.APNS_PRIVATE_KEY.replace(/\\n/g, "\n");
  if (process.env.APNS_PRIVATE_KEY_PATH) {
    try {
      return fs.readFileSync(path.resolve(process.env.APNS_PRIVATE_KEY_PATH), "utf8");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function isApnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && loadPrivateKey());
}

function getProviderToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < TOKEN_TTL_SECONDS) return cachedToken.token;

  const key = loadPrivateKey();
  if (!key) throw new Error("APNs private key not configured");

  const token = jwt.sign({ iss: process.env.APNS_TEAM_ID!, iat: now }, key, {
    algorithm: "ES256",
    keyid: process.env.APNS_KEY_ID!,
  });
  cachedToken = { token, issuedAt: now };
  return token;
}

interface LiveActivityAps {
  event: "start" | "update" | "end";
  "content-state": Record<string, unknown>;
  timestamp: number;
  "stale-date"?: number;
  "dismissal-date"?: number;
  attributes?: Record<string, unknown>;
  "attributes-type"?: string;
}

export interface ApnsResult {
  ok: boolean;
  /** true when APNs reports the token as gone (BadDeviceToken/Unregistered) — caller should delete it. */
  tokenInvalid: boolean;
  status?: number;
}

function sendApnsRequest(deviceToken: string, aps: LiveActivityAps): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    let settled = false;
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };

    client.on("error", (err) => {
      console.error("[APNS] connection error =", err);
      finish({ ok: false, tokenInvalid: false });
    });

    let token: string;
    try {
      token = getProviderToken();
    } catch (err) {
      console.error("[APNS] token error =", err);
      finish({ ok: false, tokenInvalid: false });
      return;
    }

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": LIVE_ACTIVITY_TOPIC,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
    });

    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (status >= 200 && status < 300) {
        finish({ ok: true, tokenInvalid: false, status });
        return;
      }
      const reason = (() => {
        try {
          return JSON.parse(body)?.reason as string | undefined;
        } catch {
          return undefined;
        }
      })();
      const tokenInvalid = reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
      if (!tokenInvalid) {
        console.error(`[APNS] push failed status=${status} reason=${reason ?? body}`);
      }
      finish({ ok: false, tokenInvalid, status });
    });
    req.on("error", (err) => {
      console.error("[APNS] request error =", err);
      finish({ ok: false, tokenInvalid: false });
    });

    req.end(JSON.stringify({ aps }));
  });
}

/** Starts a Live Activity remotely (push-to-start, iOS 17.2+) — used when the app is killed. */
export async function sendLiveActivityStart(
  pushToStartToken: string,
  attributes: Record<string, unknown>,
  contentState: Record<string, unknown>,
  staleDate?: number
): Promise<ApnsResult> {
  if (!isApnsConfigured()) return { ok: false, tokenInvalid: false };
  return sendApnsRequest(pushToStartToken, {
    event: "start",
    timestamp: Math.floor(Date.now() / 1000),
    "content-state": contentState,
    "stale-date": staleDate,
    attributes,
    "attributes-type": "LiveRdvAttributes",
  });
}

/** Updates a running Live Activity remotely (e.g. reservation rescheduled). */
export async function sendLiveActivityUpdate(
  updateToken: string,
  contentState: Record<string, unknown>,
  staleDate?: number
): Promise<ApnsResult> {
  if (!isApnsConfigured()) return { ok: false, tokenInvalid: false };
  return sendApnsRequest(updateToken, {
    event: "update",
    timestamp: Math.floor(Date.now() / 1000),
    "content-state": contentState,
    "stale-date": staleDate,
  });
}

/** Ends a running Live Activity remotely (e.g. reservation cancelled/completed). */
export async function sendLiveActivityEnd(
  updateToken: string,
  finalContentState?: Record<string, unknown>
): Promise<ApnsResult> {
  if (!isApnsConfigured()) return { ok: false, tokenInvalid: false };
  return sendApnsRequest(updateToken, {
    event: "end",
    timestamp: Math.floor(Date.now() / 1000),
    "content-state": finalContentState ?? {},
    "dismissal-date": Math.floor(Date.now() / 1000),
  });
}
