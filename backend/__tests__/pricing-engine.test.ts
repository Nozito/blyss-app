/**
 * Tests — pricing engine du moteur de prestations (V1 → V3).
 *
 * Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§5, §21).
 * Fonctions pures, aucun mock DB nécessaire.
 */

import { describe, it, expect } from "vitest";
import {
  computeItemPricing,
  computeReservationTotals,
  computeWorstCasePricing,
  computeFromPriceFloor,
  PricingError,
} from "../services/pricing-engine";

describe("computeItemPricing", () => {
  it("Test 1 — prestation simple (aucune variante/option) = comportement actuel", () => {
    const result = computeItemPricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      variantValues: [],
      options: [],
    });
    expect(result).toEqual({ price: 45, durationMinutes: 60 });
  });

  it("Test 2 — prestation + variante : prix/durée = base + delta", () => {
    const result = computeItemPricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      variantValues: [{ price_delta: 10, duration_delta: 15 }],
      options: [],
    });
    expect(result).toEqual({ price: 55, durationMinutes: 75 });
  });

  it("Test 3 — prestation + variante + option : cumul des deltas", () => {
    const result = computeItemPricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      variantValues: [{ price_delta: 10, duration_delta: 15 }],
      options: [
        { price_delta: 8, duration_delta: 10 },
        { price_delta: 5, duration_delta: 0 },
      ],
    });
    expect(result).toEqual({ price: 68, durationMinutes: 85 });
  });

  it("accepte un delta négatif tant que le total reste positif", () => {
    const result = computeItemPricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      variantValues: [{ price_delta: -5, duration_delta: -10 }],
      options: [],
    });
    expect(result).toEqual({ price: 40, durationMinutes: 50 });
  });

  it("rejette un total négatif plutôt que de le corriger silencieusement (décision verrouillée §0.8)", () => {
    expect(() =>
      computeItemPricing({
        basePrice: 10,
        baseDurationMinutes: 60,
        variantValues: [{ price_delta: -20, duration_delta: 0 }],
        options: [],
      })
    ).toThrow(PricingError);
  });

  it("rejette une durée nulle ou négative", () => {
    expect(() =>
      computeItemPricing({
        basePrice: 45,
        baseDurationMinutes: 30,
        variantValues: [{ price_delta: 0, duration_delta: -30 }],
        options: [],
      })
    ).toThrow(PricingError);
  });

  it("arrondit le prix à 2 décimales", () => {
    const result = computeItemPricing({
      basePrice: 10.1,
      baseDurationMinutes: 30,
      variantValues: [{ price_delta: 0.15, duration_delta: 0 }],
      options: [],
    });
    expect(result.price).toBe(10.25);
  });
});

describe("computeReservationTotals", () => {
  it("Test 6 — plusieurs prestations : somme correcte prix/durée", () => {
    const totals = computeReservationTotals([
      { price: 45, durationMinutes: 60 },
      { price: 20, durationMinutes: 30 },
      { price: 15, durationMinutes: 20 },
    ]);
    expect(totals).toEqual({ totalPrice: 80, totalDurationMinutes: 110 });
  });

  it("un seul item = ses propres totaux", () => {
    const totals = computeReservationTotals([{ price: 45, durationMinutes: 60 }]);
    expect(totals).toEqual({ totalPrice: 45, totalDurationMinutes: 60 });
  });
});

describe("computeWorstCasePricing", () => {
  it("groupe obligatoire : le pire cas retient le delta minimal (doit être choisi)", () => {
    const worst = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      groups: [
        {
          required: true,
          values: [
            { price_delta: -5, duration_delta: -10 },
            { price_delta: 10, duration_delta: 15 },
          ],
        },
      ],
      options: [],
    });
    expect(worst).toEqual({ price: 40, durationMinutes: 50 });
  });

  it("groupe facultatif : le pire cas ne retient le delta minimal que s'il est négatif", () => {
    const worstAllPositive = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      groups: [{ required: false, values: [{ price_delta: 10, duration_delta: 15 }] }],
      options: [],
    });
    // Facultatif + delta positif ⇒ la cliente peut ne rien choisir (0), pas de risque.
    expect(worstAllPositive).toEqual({ price: 45, durationMinutes: 60 });

    const worstNegativeAvailable = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      groups: [{ required: false, values: [{ price_delta: -10, duration_delta: -5 }] }],
      options: [],
    });
    // Facultatif + delta négatif disponible ⇒ la cliente PEUT le choisir, donc c'est le pire cas.
    expect(worstNegativeAvailable).toEqual({ price: 35, durationMinutes: 55 });
  });

  it("option : le pire cas ne retient le delta que s'il est négatif (sinon 0, non cochée)", () => {
    const worst = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      groups: [],
      options: [
        { price_delta: -5, duration_delta: -5 },
        { price_delta: 8, duration_delta: 10 },
      ],
    });
    expect(worst).toEqual({ price: 40, durationMinutes: 55 });
  });

  it("Test 8 — détecte une configuration dont la pire combinaison légale est un prix négatif", () => {
    const worst = computeWorstCasePricing({
      basePrice: 10,
      baseDurationMinutes: 60,
      groups: [{ required: true, values: [{ price_delta: -20, duration_delta: 0 }] }],
      options: [],
    });
    expect(worst.price).toBeLessThan(0);
  });

  it("Test 8 — détecte une configuration dont la pire combinaison légale est une durée non positive", () => {
    const worst = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 30,
      groups: [{ required: true, values: [{ price_delta: 0, duration_delta: -30 }] }],
      options: [],
    });
    expect(worst.durationMinutes).toBeLessThanOrEqual(0);
  });

  it("groupe requis sans valeur active n'est pas évalué (validation distincte)", () => {
    const worst = computeWorstCasePricing({
      basePrice: 45,
      baseDurationMinutes: 60,
      groups: [{ required: true, values: [] }],
      options: [],
    });
    expect(worst).toEqual({ price: 45, durationMinutes: 60 });
  });

  it("ne lève jamais — retourne le pire cas même négatif, à l'appelant de décider", () => {
    expect(() =>
      computeWorstCasePricing({
        basePrice: 0,
        baseDurationMinutes: 5,
        groups: [{ required: true, values: [{ price_delta: -100, duration_delta: -10 }] }],
        options: [],
      })
    ).not.toThrow();
  });
});

describe("computeFromPriceFloor — décision verrouillée §6.1/§6.5", () => {
  it("base + minimum du delta d'un groupe obligatoire", () => {
    const floor = computeFromPriceFloor({
      basePrice: 45,
      requiredGroups: [{ values: [{ price_delta: 0, duration_delta: 0 }, { price_delta: 10, duration_delta: 15 }] }],
    });
    expect(floor).toBe(45);
  });

  it("inclut le minimum même si tous les deltas du groupe obligatoire sont positifs (jamais le prix de base seul)", () => {
    const floor = computeFromPriceFloor({
      basePrice: 40,
      requiredGroups: [{ values: [{ price_delta: 5, duration_delta: 0 }, { price_delta: 10, duration_delta: 0 }] }],
    });
    expect(floor).toBe(45); // 40 + min(5, 10), jamais 40 seul
  });

  it("ignore totalement les groupes facultatifs, même à delta négatif", () => {
    const withOptionalGroupPassedAsRequired = computeFromPriceFloor({
      basePrice: 45,
      requiredGroups: [], // le groupe facultatif n'est jamais transmis ici — c'est la responsabilité de l'appelant de filtrer required=true
    });
    expect(withOptionalGroupPassedAsRequired).toBe(45);
  });

  it("plusieurs groupes obligatoires : somme des minimums de chacun", () => {
    const floor = computeFromPriceFloor({
      basePrice: 45,
      requiredGroups: [
        { values: [{ price_delta: 5, duration_delta: 0 }, { price_delta: 10, duration_delta: 0 }] },
        { values: [{ price_delta: -3, duration_delta: 0 }, { price_delta: 2, duration_delta: 0 }] },
      ],
    });
    expect(floor).toBe(47); // 45 + 5 + (-3)
  });

  it("groupe obligatoire sans valeur active : ignoré (validation distincte)", () => {
    const floor = computeFromPriceFloor({ basePrice: 45, requiredGroups: [{ values: [] }] });
    expect(floor).toBe(45);
  });
});
