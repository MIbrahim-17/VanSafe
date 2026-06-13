/**
 * Reverse-geocode lat/lng to a short human-readable place name using
 * OpenStreetMap Nominatim (free, no API key). Returns null on any failure so
 * callers can gracefully fall back to coordinates only.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=16` +
      `&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VanSafe/1.0 (school-van tracking demo)" },
      // Nominatim asks for light usage; cache identical lookups for a minute.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = data.address ?? {};

    const parts = [
      a.road || a.neighbourhood || a.suburb,
      a.suburb || a.neighbourhood || a.city_district,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean) as string[];

    const name = Array.from(new Set(parts)).slice(0, 2).join(", ");
    if (name) return name;

    return data.display_name?.split(",").slice(0, 2).join(",").trim() || null;
  } catch {
    return null;
  }
}
