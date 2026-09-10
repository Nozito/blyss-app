/**
 * Catalogue des offres d'abonnement Blyss — source de vérité des PRIX côté admin.
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * `subscriptions.monthly_price` / `total_price` ne sont fiables QUE pour un vrai
 * achat App Store (le webhook RevenueCat y écrit `price_in_purchased_currency`).
 * Pour les lignes seed, `admin_grant`, `admin_internal` — ou un achat sandbox
 * qui remonte à 0 — la valeur stockée est fausse (99 €, 358,80 €, 0 €…).
 *
 * RevenueCat n'expose PAS les prix App Store dans son API serveur : `rc products
 * list` ne renvoie que les identifiants (`signature_monthly`, `signature_annual`,
 * …). Les prix vivent dans App Store Connect / le StoreKit du téléphone.
 *
 * Donc : une grille canonique, alignée sur l'offering RevenueCat « Blyss »
 * (mapping plan → identifiant produit) et sur `constants/plans.ts` côté mobile.
 * L'admin RÉSOUT le prix affiché depuis cette grille via (plan + mensuel/annuel),
 * et ne fait confiance à la valeur stockée que pour un vrai achat store.
 *
 * ⚠️ Si les prix changent dans App Store Connect, mettre à jour ici + mobile
 * `constants/plans.ts`. `verifyCatalogAgainstRevenueCat()` vérifie au moins que
 * les identifiants produits existent toujours et sont actifs côté RevenueCat.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- `log.warn`'s ctx arg est
   typé large dans lib/logger, on caste comme dans lib/revenuecat.ts. */
import { log } from "./logger";

export type Plan = "start" | "serenite" | "signature";
export type BillingType = "monthly" | "one_time";

export interface PlanCatalogEntry {
  label: string;
  /** Prix mensuel (formule mensuelle), EUR TTC. */
  monthly: number;
  /** Prix total de la formule annuelle (facturée en une fois), EUR TTC. */
  annual: number;
  /** Identifiants produit RevenueCat / App Store Connect. */
  productMonthly: string;
  productAnnual: string;
}

/** Grille officielle Blyss. Alignée sur mobile `constants/plans.ts`. */
export const PLAN_CATALOG: Record<Plan, PlanCatalogEntry> = {
  start: {
    label: "Start",
    monthly: 29.99,
    annual: 299.99,
    productMonthly: "start_monthly",
    productAnnual: "start_annual",
  },
  serenite: {
    label: "Sérénité",
    monthly: 39.99,
    annual: 399.99,
    productMonthly: "serenite_monthly",
    productAnnual: "serenite_annual",
  },
  signature: {
    label: "Signature",
    monthly: 49.99,
    annual: 499.99,
    productMonthly: "signature_monthly",
    productAnnual: "signature_annual",
  },
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface ResolvedPricing {
  /** Prix mensuel à afficher (annuel → total / 12, pour comparer les MRR). */
  monthlyPrice: number;
  /** Prix total (formule annuelle uniquement, sinon null). */
  totalPrice: number | null;
  /** D'où vient le prix : `store` = vrai achat App Store, `catalog` = grille Blyss. */
  priceSource: "store" | "catalog";
}

/**
 * Résout le prix « officiel Blyss » d'une ligne d'abonnement.
 * - vrai achat App Store (`payment_id` commence par `rc_`) avec un montant > 0
 *   stocké → on garde ce montant (peut inclure promo / prix régional).
 * - sinon → grille catalogue via (plan, billing_type).
 */
export function resolveSubscriptionPricing(row: {
  plan: string;
  billing_type: string;
  monthly_price: number | string | null;
  total_price: number | string | null;
  payment_id: string | null;
}): ResolvedPricing {
  const entry = PLAN_CATALOG[row.plan as Plan];
  const storedMonthly = row.monthly_price == null ? 0 : Number(row.monthly_price);
  const storedTotal = row.total_price == null ? null : Number(row.total_price);
  const isStorePurchase = typeof row.payment_id === "string" && row.payment_id.startsWith("rc_");
  const isAnnual = row.billing_type === "one_time";

  if (isStorePurchase && storedMonthly > 0) {
    return {
      monthlyPrice: round2(storedMonthly),
      totalPrice: isAnnual ? (storedTotal && storedTotal > 0 ? round2(storedTotal) : null) : null,
      priceSource: "store",
    };
  }

  // Plan inconnu → on ne devine pas.
  if (!entry) {
    return { monthlyPrice: round2(storedMonthly), totalPrice: storedTotal, priceSource: "catalog" };
  }

  if (isAnnual) {
    return { monthlyPrice: round2(entry.annual / 12), totalPrice: entry.annual, priceSource: "catalog" };
  }
  return { monthlyPrice: entry.monthly, totalPrice: null, priceSource: "catalog" };
}

/**
 * Expression SQL qui résout le prix mensuel « officiel Blyss » d'une ligne
 * `subscriptions` — même règle que resolveSubscriptionPricing, pour les agrégats
 * (MRR, séries historiques, mix par formule) qui somment en base.
 *
 * @param alias alias de la table subscriptions dans la requête (défaut `s`).
 */
export function resolvedMonthlyPriceSQL(alias = "s"): string {
  const monthlyWhens = (Object.keys(PLAN_CATALOG) as Plan[])
    .map((p) => `WHEN ${alias}.plan = '${p}' AND ${alias}.billing_type = 'monthly' THEN ${PLAN_CATALOG[p].monthly}`)
    .join("\n        ");
  const annualWhens = (Object.keys(PLAN_CATALOG) as Plan[])
    .map((p) => `WHEN ${alias}.plan = '${p}' THEN ${round2(PLAN_CATALOG[p].annual / 12)}`)
    .join("\n        ");
  return `(CASE
        WHEN ${alias}.payment_id LIKE 'rc_%' AND ${alias}.monthly_price > 0 THEN ${alias}.monthly_price
        ${monthlyWhens}
        ${annualWhens}
        ELSE COALESCE(${alias}.monthly_price, 0)
      END)`;
}

// ── Vérification vs RevenueCat (identifiants produits, pas les prix) ─────────

let _lastVerify = 0;
let _verifyCache: string[] = [];

/**
 * Vérifie auprès de RevenueCat (API v2) que les identifiants produits du
 * catalogue existent toujours et sont actifs. Ne récupère PAS les prix (RC ne
 * les expose pas). Renvoie la liste des avertissements (drift). Résultat mis en
 * cache 6 h. No-op silencieux si `REVENUECAT_SECRET_API_KEY` /
 * `REVENUECAT_PROJECT_ID` absents.
 */
export async function verifyCatalogAgainstRevenueCat(force = false): Promise<string[]> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) return [];
  if (!force && Date.now() - _lastVerify < 6 * 3600_000) return _verifyCache;

  const warnings: string[] = [];
  try {
    const resp = await fetch(
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/products?limit=100`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!resp.ok) {
      log.warn("lib/subscription-catalog", `RC products lookup failed: HTTP ${resp.status}`);
      return _verifyCache;
    }
    const json = (await resp.json()) as { items?: { store_identifier?: string; state?: string }[] };
    const active = new Set(
      (json.items ?? [])
        .filter((p) => p.state === "active" && typeof p.store_identifier === "string")
        .map((p) => p.store_identifier as string)
    );
    for (const p of Object.keys(PLAN_CATALOG) as Plan[]) {
      for (const id of [PLAN_CATALOG[p].productMonthly, PLAN_CATALOG[p].productAnnual]) {
        if (!active.has(id)) warnings.push(`Produit RevenueCat "${id}" (${p}) introuvable ou inactif`);
      }
    }
  } catch (err) {
    log.warn("lib/subscription-catalog", "RC verify error", { err: String(err) } as any);
    return _verifyCache;
  }

  _lastVerify = Date.now();
  _verifyCache = warnings;
  if (warnings.length) log.warn("lib/subscription-catalog", "Catalogue désaligné de RevenueCat", { warnings } as any);
  return warnings;
}
