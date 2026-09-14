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
 *
 * `type=commune-actuelle,arrondissement-municipal` : par défaut l'API ne
 * renvoie que la commune entière ("Paris"), jamais ses arrondissements —
 * "arrondissement-municipal" fait remonter "Paris 15e Arrondissement",
 * "Lyon 3e Arrondissement" etc. comme résultats à part entière (Paris,
 * Lyon, Marseille sont les seules villes découpées ainsi en France).
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
    url.searchParams.set("type", "commune-actuelle,arrondissement-municipal");
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

export interface AddressSuggestion {
  label: string; // numéro + voie seuls, ex. "12 Rue de la Paix" — pas le code postal/ville
  postcode: string;
  city: string;
  fullLabel: string; // adresse complète formatée, ex. "12 Rue de la Paix 75002 Paris"
  lat: number;
  lon: number;
}

/**
 * Autocomplete + vérification d'adresses françaises réelles (numéro + voie),
 * pour le profil public pro (adresse + code postal). Utilise la Base Adresse
 * Nationale (api-adresse.data.gouv.fr) plutôt que Nominatim (déjà utilisé
 * pour geocodeCity dans lib/geocoding.ts) : gratuite, sans rate-limit,
 * pensée pour l'autocomplete, et donne directement les coordonnées —
 * `type=housenumber` restreint aux adresses précises (pas juste une rue ou
 * une commune).
 */
router.get("/addresses", publicListingLimiter, async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || "").trim();
  if (q.length < 3) {
    return res.json({ success: true, data: [] });
  }

  try {
    const url = new URL("https://api-adresse.data.gouv.fr/search/");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "housenumber");
    url.searchParams.set("autocomplete", "1");
    url.searchParams.set("limit", "8");

    const apiRes = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    if (!apiRes.ok) {
      return res.json({ success: true, data: [], degraded: true });
    }

    const json = (await apiRes.json()) as {
      features?: {
        properties: { name: string; postcode: string; city: string; label: string };
        geometry: { coordinates: [number, number] };
      }[];
    };
    const data: AddressSuggestion[] = (json.features ?? []).map((f) => ({
      label: f.properties.name,
      postcode: f.properties.postcode,
      city: f.properties.city,
      fullLabel: f.properties.label,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
    res.json({ success: true, data });
  } catch (err) {
    log.error("/api/geo/addresses", err instanceof Error ? err.message : String(err));
    res.json({ success: true, data: [], degraded: true });
  }
});

export default router;
