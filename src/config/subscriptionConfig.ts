/**
 * subscriptionConfig — Source de vérité unique pour le contrôle d'accès par abonnement.
 *
 * Règle : sans abonnement actif → aucun accès aux pages métier.
 * Hiérarchie : start (1) → serenite (2) → signature (3) — chaque plan inclut les plans inférieurs.
 */

import type { PlanId } from "@/services/revenuecat";
export type { PlanId };

// ─── Hiérarchie des plans ────────────────────────────────────────────────────

export const PLAN_HIERARCHY: Record<PlanId, number> = {
  start:    1,
  serenite: 2,
  signature: 3,
};

export const PLAN_LABELS: Record<PlanId, string> = {
  start:    "Start",
  serenite: "Sérénité",
  signature: "Signature",
};

export const PLAN_PRICES: Record<PlanId, string> = {
  start:    "49,90€/mois",
  serenite: "39,90€/mois (3 mois)",
  signature: "29,90€/mois (12 mois)",
};

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Routes PRO accessibles sans abonnement actif.
 * Le flow d'abonnement doit toujours rester accessible.
 */
export const PRO_FREE_ROUTES: string[] = [
  "/pro/subscription",
  "/pro/subscription-success",
  "/pro/subscription-settings",
  "/pro/upgrade",
];

/**
 * Plan minimum requis par préfixe de route PRO.
 * Une route non listée est considérée comme "start" minimum.
 */
export const ROUTE_MIN_PLAN: Record<string, PlanId> = {
  "/pro/dashboard":         "start",
  "/pro/calendar":          "start",
  "/pro/clients":           "start",
  "/pro/profile":           "start",
  "/pro/settings":          "start",
  "/pro/notifications":     "start",
  "/pro/help":              "start",
  "/pro/public-profile":    "start",
  "/pro/prestations":       "start",
  "/pro/finance":           "serenite",
  "/pro/payments":          "serenite",
};

// ─── Fonctionnalités ─────────────────────────────────────────────────────────

export type FeatureId =
  | "dashboard"
  | "calendar"
  | "clients"
  | "prestations"
  | "public_profile"
  | "settings"
  | "notifications"
  | "help"
  | "instagram_portfolio"
  | "auto_reminders"
  | "statistics"
  | "billing"
  | "post_service"
  | "online_payments"       // SIGNATURE + flag user accept_online_payment
  | "priority_support";

export const FEATURE_MIN_PLAN: Record<FeatureId, PlanId> = {
  dashboard:           "start",
  calendar:            "start",
  clients:             "start",
  prestations:         "start",
  public_profile:      "start",
  settings:            "start",
  notifications:       "start",
  help:                "start",
  instagram_portfolio: "serenite",
  auto_reminders:      "serenite",
  statistics:          "serenite",
  billing:             "serenite",
  post_service:        "signature",
  online_payments:     "signature",
  priority_support:    "signature",
};

export const FEATURE_LABELS: Record<FeatureId, string> = {
  dashboard:           "Tableau de bord",
  calendar:            "Agenda",
  clients:             "Clientes",
  prestations:         "Prestations",
  public_profile:      "Page pro personnalisée",
  settings:            "Paramètres",
  notifications:       "Notifications",
  help:                "Aide",
  instagram_portfolio: "Portfolio Instagram",
  auto_reminders:      "Rappels & messages automatiques",
  statistics:          "Statistiques",
  billing:             "Facturation",
  post_service:        "Suivis post-prestation",
  online_payments:     "Encaissement en ligne",
  priority_support:    "Support prioritaire",
};

/** Fonctionnalités incluses dans chaque plan (cumulatif) */
export const PLAN_FEATURES: Record<PlanId, FeatureId[]> = {
  start: [
    "dashboard", "calendar", "clients", "prestations",
    "public_profile", "settings", "notifications", "help",
  ],
  serenite: [
    "dashboard", "calendar", "clients", "prestations",
    "public_profile", "settings", "notifications", "help",
    "instagram_portfolio", "auto_reminders", "statistics", "billing",
  ],
  signature: [
    "dashboard", "calendar", "clients", "prestations",
    "public_profile", "settings", "notifications", "help",
    "instagram_portfolio", "auto_reminders", "statistics", "billing",
    "post_service", "online_payments", "priority_support",
  ],
};

// ─── Navigation PRO ───────────────────────────────────────────────────────────

export const PRO_NAV_ITEMS = [
  { path: "/pro/dashboard", label: "Accueil",    minPlan: "start"  as PlanId },
  { path: "/pro/calendar",  label: "Calendrier", minPlan: "start"  as PlanId },
  { path: "/pro/clients",   label: "Clients",    minPlan: "start"  as PlanId },
  { path: "/pro/profile",   label: "Profil",     minPlan: "start"  as PlanId },
] as const;

/** Menu du ProProfile — items et leur plan minimum */
export const PRO_PROFILE_MENU = [
  { path: "/pro/prestations", label: "Mes prestations", feature: "prestations"    as FeatureId },
  { path: "/pro/finance",     label: "Finance",          feature: "statistics"     as FeatureId },
  { path: "/pro/settings",    label: "Paramètres",       feature: "settings"       as FeatureId },
  { path: "/pro/payments",    label: "Encaissements",    feature: "billing"        as FeatureId },
  { path: "/pro/notifications",label: "Notifications",   feature: "notifications"  as FeatureId },
  { path: "/pro/help",        label: "Aide",             feature: "help"           as FeatureId },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function planLevel(plan: PlanId | null): number {
  if (!plan) return 0;
  return PLAN_HIERARCHY[plan] ?? 0;
}

/** Vérifie si une route est dans le flow d'abonnement (toujours accessible) */
export function isSubscriptionRoute(pathname: string): boolean {
  return PRO_FREE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}

/** Vérifie si le plan donne accès à une route PRO */
export function canAccessRoute(plan: PlanId | null, pathname: string): boolean {
  if (!plan) return false;
  // Cherche le préfixe le plus long correspondant
  const entries = Object.entries(ROUTE_MIN_PLAN).sort(
    (a, b) => b[0].length - a[0].length
  );
  const match = entries.find(
    ([route]) => pathname === route || pathname.startsWith(route + "/")
  );
  if (!match) return planLevel(plan) >= 1; // Route non listée → START minimum
  return planLevel(plan) >= planLevel(match[1]);
}

/** Vérifie si le plan inclut une fonctionnalité */
export function canAccessFeature(plan: PlanId | null, feature: FeatureId): boolean {
  if (!plan) return false;
  return planLevel(plan) >= planLevel(FEATURE_MIN_PLAN[feature]);
}

/** Retourne le plan minimum requis pour une route */
export function getMinPlanForRoute(pathname: string): PlanId | null {
  const entries = Object.entries(ROUTE_MIN_PLAN).sort(
    (a, b) => b[0].length - a[0].length
  );
  const match = entries.find(
    ([route]) => pathname === route || pathname.startsWith(route + "/")
  );
  return match ? (match[1] as PlanId) : "start";
}

/** Retourne le plan minimum requis pour une fonctionnalité */
export function getMinPlanForFeature(feature: FeatureId): PlanId {
  return FEATURE_MIN_PLAN[feature];
}

/** Retourne true si le statut d'abonnement backend est considéré actif */
export function isSubscriptionStatusActive(status: string | undefined): boolean {
  return status === "active" || status === "trialing";
}
