/**
 * Geocoding helper using Nominatim (OpenStreetMap) — free, no API key required.
 * Rate-limited to 1 req/s per OSM policy; only called on profile update when city changes.
 */

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Geocode a city name → { lat, lng } or null if not found.
 * Scoped to France by default (countrycodes=fr).
 */
export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  if (!city || city.trim().length < 2) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", city.trim());
  url.searchParams.set("countrycodes", "fr,be,ch,lu"); // francophone countries
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "BlyssApp/1.0 (contact@blyssapp.fr)",
        "Accept-Language": "fr",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const results: NominatimResult[] = await res.json();
    if (!results.length) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch {
    // Network error or timeout — silently return null (non-blocking)
    return null;
  }
}

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
