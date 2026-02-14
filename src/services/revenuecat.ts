import { Purchases, type CustomerInfo } from "@revenuecat/purchases-js";

const RC_API_KEY = import.meta.env.VITE_REVENUECAT_API_KEY;

export type PlanId = "start" | "serenite" | "signature";

export function initRevenueCat(appUserId: string) {
  return Purchases.configure(RC_API_KEY, appUserId);
}

export function getActivePlan(customerInfo: CustomerInfo | null): PlanId | null {
  const ents = customerInfo?.entitlements?.active ?? {};
  if ("signature" in ents) return "signature";
  if ("serenite" in ents) return "serenite";
  if ("start" in ents) return "start";
  return null;
}

export function hasEntitlement(
  customerInfo: CustomerInfo | null,
  entId: string
): boolean {
  return entId in (customerInfo?.entitlements?.active ?? {});
}
