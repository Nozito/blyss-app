/**
 * Autocomplete + vérification de villes françaises réelles.
 *
 * Réintroduit après suppression comme code mort le temps où seules les
 * préférences client (#5, retirées au profit de la géoloc) l'utilisaient —
 * sert maintenant le champ "ville" du profil pro (inscription + paramètres),
 * qui était du texte libre sans garantie de correspondre à un lieu réel.
 *
 * Utilise l'API officielle des communes (geo.api.gouv.fr, INSEE) plutôt que
 * le géocodage Nominatim déjà utilisé pour l'adresse des pros (lib/geocoding.ts) :
 * gratuite, sans rate-limit (contrairement à Nominatim, 1 req/s), pensée pour
 * l'autocomplete (`boost=population` classe Paris avant Parisot). Scopée à la
 * France — contrairement au géocodage pro qui couvre aussi BE/CH/LU.
 */

import express, { Request, Response } from "express";
import { publicListingLimiter } from "../middleware/rate-limits";
import { log } from "../lib/logger";

const router = express.Router();

export interface CitySuggestion {
  nom: string;
  codePostal: string | null;
}

// `degraded: true` distingue "aucune ville ne correspond" (upstream a bien
// répondu, liste vide légitime — ex. faute de frappe) de "impossible de
// vérifier" (upstream down/timeout). Le profil pro (settings.tsx,
// register.tsx) bloque la sauvegarde dans le premier cas mais pas le
// second : une panne de geo.api.gouv.fr ne doit jamais empêcher un pro de
// sauvegarder son profil.
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
      return res.json({ success: true, data: [], degraded: true });
    }

    const results = (await apiRes.json()) as { nom: string; codesPostaux?: string[] }[];
    const data: CitySuggestion[] = results.map((r) => ({
      nom: r.nom,
      codePostal: r.codesPostaux?.[0] ?? null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    log.error("/api/geo/cities", err instanceof Error ? err.message : String(err));
    res.json({ success: true, data: [], degraded: true });
  }
});

export default router;
