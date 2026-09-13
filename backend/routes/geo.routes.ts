/**
 * Autocomplete de villes françaises réelles — préférences client (#5).
 *
 * Avant ce fichier, le champ "ville" des préférences client était du texte
 * libre : rien n'empêchait une faute de frappe ou un nom inventé, et le
 * filtre ILIKE des recommandations (routes/client-onboarding.routes.ts)
 * ne matchait alors plus rien.
 *
 * Utilise l'API officielle des communes (geo.api.gouv.fr, INSEE) plutôt que
 * le géocodage Nominatim déjà utilisé pour l'adresse des pros (lib/geocoding.ts) :
 * gratuite, sans rate-limit (contrairement à Nominatim, 1 req/s), pensée pour
 * l'autocomplete (`boost=population` classe Paris avant Parisot). Scopée à la
 * France — les pros/clientes observées jusqu'ici sont toutes en France,
 * contrairement au géocodage pro qui couvre aussi BE/CH/LU.
 */

import express, { Request, Response } from "express";
import { publicListingLimiter } from "../middleware/rate-limits";
import { log } from "../lib/logger";

const router = express.Router();

export interface CitySuggestion {
  nom: string;
  codePostal: string | null;
}

router.get("/cities", publicListingLimiter, async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || "").trim();
  if (q.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const url = new URL("https://geo.api.gouv.fr/communes");
    url.searchParams.set("nom", q);
    url.searchParams.set("boost", "population");
    url.searchParams.set("limit", "8");
    url.searchParams.set("fields", "nom,codesPostaux");

    const apiRes = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    if (!apiRes.ok) {
      return res.json({ success: true, data: [] }); // dégrade en silence, le champ reste utilisable en texte libre
    }

    const results = (await apiRes.json()) as { nom: string; codesPostaux?: string[] }[];
    const data: CitySuggestion[] = results.map((r) => ({
      nom: r.nom,
      codePostal: r.codesPostaux?.[0] ?? null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    log.error("/api/geo/cities", err instanceof Error ? err.message : String(err));
    res.json({ success: true, data: [] }); // jamais bloquant — le texte libre reste un repli valide
  }
});

export default router;
