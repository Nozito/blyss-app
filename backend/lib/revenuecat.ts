/**
 * RevenueCat REST API client (server-side reconciliation).
 *
 * The webhook is the primary source of truth for subscription activation,
 * but webhook delivery is asynchronous and can be delayed or missed. This
 * module lets the backend ask RevenueCat directly "what is this user's
 * entitlement state right now?" as a fallback right after a client-reported
 * purchase, instead of trusting the client's local CustomerInfo (which a
 * client could fake) or leaving the user stuck if the webhook never lands.
 *
 * Requires REVENUECAT_SECRET_API_KEY (RevenueCat dashboard → Project
 * Settings → API keys → secret key). This is NOT the same as the public
 * SDK keys used by the mobile app to configure the Purchases SDK.
 */

import { log } from "./logger";

export type RCPlan = "start" | "serenite" | "signature";

const PLAN_PRIORITY: RCPlan[] = ["signature", "serenite", "start"];

export interface ActiveEntitlement {
  plan: RCPlan;
  expiresAtMs: number | null;
}

interface RcEntitlement {
  expires_date: string | null;
  product_identifier?: string;
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>;
  };
}

/**
 * Queries RevenueCat for a user's current entitlement state and returns the
 * highest-tier plan that is currently active (expires_date in the future,
 * or null for a non-expiring/lifetime entitlement), or null if none is
 * active. Returns null (not throw) if the API key isn't configured or the
 * request fails, so callers can treat it as "reconciliation unavailable"
 * rather than crash a request.
 */
export async function getActiveEntitlement(userId: number): Promise<ActiveEntitlement | null> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) {
    log.warn("lib/revenuecat", "REVENUECAT_SECRET_API_KEY not configured — reconciliation skipped");
    return null;
  }

  let json: RcSubscriberResponse;
  try {
    const resp = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(String(userId))}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      log.warn("lib/revenuecat", `Subscriber lookup failed: HTTP ${resp.status}`, { userId } as any);
      return null;
    }
    json = (await resp.json()) as RcSubscriberResponse;
  } catch (err) {
    log.error("lib/revenuecat", "Subscriber lookup network error", err instanceof Error ? err.stack : String(err));
    return null;
  }

  const entitlements = json.subscriber?.entitlements ?? {};
  const now = Date.now();

  for (const plan of PLAN_PRIORITY) {
    const ent = entitlements[plan];
    if (!ent) continue;
    const expiresAtMs = ent.expires_date ? new Date(ent.expires_date).getTime() : null;
    const isActive = expiresAtMs === null || expiresAtMs > now;
    if (isActive) {
      return { plan, expiresAtMs };
    }
  }

  return null;
}
