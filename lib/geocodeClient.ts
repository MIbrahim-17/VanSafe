/**
 * Browser-side geocoding for the map location picker (OSM Nominatim, keyless).
 * Distinct from lib/geocode.ts (server-only) so it can run in client components.
 */
export interface PlaceHit {
  label: string;
  lat: number;
  lng: number;
}

/** Forward search: free-text query -> ranked place suggestions (Pakistan). */
export async function searchPlaces(q: string, city?: string): Promise<PlaceHit[]> {
  if (q.trim().length < 3) return [];
  const query = [q, city, "Pakistan"].filter(Boolean).join(", ");
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=pk&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
    return data.map((h) => ({ label: h.display_name, lat: +h.lat, lng: +h.lon }));
  } catch {
    return [];
  }
}

/** Reverse: coordinates -> a short human address (first few components). */
export async function reverseClient(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`
    );
    if (!res.ok) return "";
    const data = (await res.json()) as { display_name?: string };
    return data.display_name?.split(",").slice(0, 4).join(",").trim() ?? "";
  } catch {
    return "";
  }
}
