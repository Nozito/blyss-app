/**
 * Pricing engine du moteur de prestations générique — V1 → V3.
 *
 * Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§5).
 * Fonctions pures, sans accès DB, testables isolément. Deux usages distincts :
 *
 *   - computeItemPricing / computeReservationTotals : calcul du prix/durée
 *     RÉEL d'une sélection donnée (variantes + options choisies), utilisé à
 *     la création d'une réservation. Lève si le total est négatif — aucune
 *     correction silencieuse (doc §5.3, décision verrouillée §0.8).
 *
 *   - computeWorstCasePricing : calcul du pire prix/durée ATTEIGNABLE par une
 *     configuration de prestation (tous ses groupes/options actifs), utilisé
 *     à l'ÉCRITURE de la config côté pro pour interdire d'enregistrer une
 *     configuration qui permettrait à une cliente d'aboutir à un prix ou une
 *     durée invalide. C'est le filet PRINCIPAL ; le rejet à la réservation
 *     (computeItemPricing) est le filet de SECOURS si la config a été
 *     modifiée hors du chemin de validation normal.
 */

export class PricingError extends Error {
  constructor(
    message: string,
    public code: "NEGATIVE_PRICE" | "NON_POSITIVE_DURATION"
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export interface PricingDelta {
  price_delta: number;
  duration_delta: number;
}

export interface ItemPricingInput {
  basePrice: number;
  baseDurationMinutes: number;
  /** Une valeur sélectionnée par groupe obligatoire/facultatif rempli. */
  variantValues: PricingDelta[];
  /** Options cochées. */
  options: PricingDelta[];
}

export interface ItemPricingResult {
  price: number;
  durationMinutes: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Prix/durée finaux d'un élément de réservation pour une sélection donnée.
 * Lève PricingError si le total est négatif/nul plutôt que de corriger
 * silencieusement — la configuration pro est censée l'avoir déjà empêché
 * (computeWorstCasePricing), ceci est le filet de sécurité.
 */
export function computeItemPricing(input: ItemPricingInput): ItemPricingResult {
  const price = round2(
    input.basePrice +
      input.variantValues.reduce((sum, v) => sum + Number(v.price_delta), 0) +
      input.options.reduce((sum, o) => sum + Number(o.price_delta), 0)
  );
  const durationMinutes =
    input.baseDurationMinutes +
    input.variantValues.reduce((sum, v) => sum + Number(v.duration_delta), 0) +
    input.options.reduce((sum, o) => sum + Number(o.duration_delta), 0);

  if (price < 0) {
    throw new PricingError("Cette configuration aboutit à un prix négatif.", "NEGATIVE_PRICE");
  }
  if (durationMinutes <= 0) {
    throw new PricingError("Cette configuration aboutit à une durée nulle ou négative.", "NON_POSITIVE_DURATION");
  }

  return { price, durationMinutes };
}

/** Totaux d'une réservation (V3 : plusieurs items ; V1 : un seul item). */
export function computeReservationTotals(items: ItemPricingResult[]): {
  totalPrice: number;
  totalDurationMinutes: number;
} {
  return {
    totalPrice: round2(items.reduce((sum, i) => sum + i.price, 0)),
    totalDurationMinutes: items.reduce((sum, i) => sum + i.durationMinutes, 0),
  };
}

export interface WorstCaseGroupInput {
  required: boolean;
  /** Valeurs actives uniquement — un groupe requis sans valeur active est une erreur distincte (non traitée ici). */
  values: PricingDelta[];
}

export interface WorstCasePricingInput {
  basePrice: number;
  baseDurationMinutes: number;
  groups: WorstCaseGroupInput[];
  /** Options actives uniquement. */
  options: PricingDelta[];
}

/**
 * Pire prix/durée atteignable par une configuration de prestation :
 *   - groupe obligatoire : la cliente DOIT choisir une valeur → on prend le
 *     delta minimal parmi les valeurs actives (ne peut pas être évité).
 *   - groupe facultatif : la cliente PEUT ne rien choisir (delta 0) → on ne
 *     retient le delta minimal que s'il est négatif (min(0, delta)).
 *   - option : cochée ou non (delta 0 si non cochée) → min(0, delta).
 *
 * Ne lève jamais — retourne le pire cas même s'il est négatif, à l'appelant
 * de décider (rejet de la sauvegarde de config, doc §5.3).
 */
export function computeWorstCasePricing(input: WorstCasePricingInput): ItemPricingResult {
  let price = input.basePrice;
  let durationMinutes = input.baseDurationMinutes;

  for (const group of input.groups) {
    if (group.values.length === 0) continue; // groupe requis sans valeur active = validation distincte
    const minPriceDelta = Math.min(...group.values.map((v) => Number(v.price_delta)));
    const minDurationDelta = Math.min(...group.values.map((v) => Number(v.duration_delta)));
    if (group.required) {
      price += minPriceDelta;
      durationMinutes += minDurationDelta;
    } else {
      price += Math.min(0, minPriceDelta);
      durationMinutes += Math.min(0, minDurationDelta);
    }
  }

  for (const option of input.options) {
    price += Math.min(0, Number(option.price_delta));
    durationMinutes += Math.min(0, Number(option.duration_delta));
  }

  return { price: round2(price), durationMinutes };
}

export interface FromPriceFloorInput {
  basePrice: number;
  /** Groupes de variantes OBLIGATOIRES actifs uniquement, avec leurs valeurs actives. */
  requiredGroups: Array<{ values: PricingDelta[] }>;
}

/**
 * Prix plancher réellement réservable pour l'affichage "à partir de" en liste
 * de prestations (doc §6.1, §6.5 — décision verrouillée) :
 *
 *   prix_affiché = prestation.price + Σ min(price_delta) par groupe OBLIGATOIRE
 *
 * Distincte de `computeWorstCasePricing` (§5.3) : ici on ne compte JAMAIS les
 * groupes facultatifs ni les options, même si l'un d'eux a un delta négatif —
 * un élément que la cliente peut choisir de ne pas prendre ne fait pas partie
 * d'un minimum garanti. Un groupe obligatoire dont tous les deltas actifs
 * sont positifs contribue quand même son minimum (jamais 0) : le "à partir
 * de" doit toujours être un montant réellement atteignable, pas un prix de
 * base théorique qu'aucune configuration ne permet d'obtenir seule.
 */
export function computeFromPriceFloor(input: FromPriceFloorInput): number {
  let floor = input.basePrice;
  for (const group of input.requiredGroups) {
    if (group.values.length === 0) continue; // groupe requis sans valeur active = validation distincte (§5.3)
    floor += Math.min(...group.values.map((v) => Number(v.price_delta)));
  }
  return round2(floor);
}

/**
 * Tri de l'ordre d'un panier multi-prestations (V3, doc §4/§10, décision
 * verrouillée) : `ordering_rank` numérique croissant, PAS de dépendances
 * pair-à-pair ni de tri topologique. Départage déterministe par id de
 * prestation croissant (jamais par l'ordre d'arrivée dans la requête, pour
 * qu'une même sélection produise toujours le même ordre quel que soit
 * l'ordre dans lequel la cliente a ajouté les prestations au panier).
 *
 * `Array.prototype.sort` est stable depuis ES2019 (garanti par la spec) :
 * deux occurrences de la MÊME prestation (rang et id strictement égaux, cas
 * "prestations identiques" du panier) conservent leur ordre d'arrivée entre
 * elles — c'est la seule situation où l'ordre d'entrée influence le résultat,
 * et c'est le comportement voulu (rien d'autre ne les différencie).
 *
 * Utilisé à l'identique par reservation.service.ts (numérotation `position`
 * des `reservation_items`) et availability.service.ts (ordre des buffers
 * dans `resolveServiceBlocking`) — les deux DOIVENT trier de façon identique,
 * sans quoi la position affichée à l'historique ne correspondrait plus à
 * l'ordre réellement bloqué au calendrier.
 */
export function sortByOrderingRank<T>(items: T[], getRank: (item: T) => number, getId: (item: T) => number): T[] {
  return [...items].sort((a, b) => getRank(a) - getRank(b) || getId(a) - getId(b));
}
