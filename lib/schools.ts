import rawSchoolData from "./schools-data.json";

/**
 * City -> Area -> School catalog. The data lives in lib/schools-data.json as the
 * single source of truth (also consumed by scripts/scrape-schools.mjs, which
 * loads it into the `schools` table). The app reads schools DB-first and falls
 * back to this catalog when the table is empty.
 */
export interface School {
  name: string;
  lat: number;
  lng: number;
}

export const SCHOOL_DATA: Record<string, Record<string, School[]>> =
  rawSchoolData as Record<string, Record<string, School[]>>;

/** Sentinel value used by selects to reveal a manual text input. */
export const OTHER = "__other__";

export function hasCatalog(city: string): boolean {
  return Boolean(SCHOOL_DATA[city]);
}

export function getAreas(city: string): string[] {
  return Object.keys(SCHOOL_DATA[city] ?? {});
}

/** School names within a city/area (keeps the string[]-based UI unchanged). */
export function getSchools(city: string, area: string): string[] {
  return (SCHOOL_DATA[city]?.[area] ?? []).map((s) => s.name);
}

/** Find which catalog area a school belongs to (for regrouping saved data). */
export function areaOfSchool(city: string, school: string): string | null {
  const areas = SCHOOL_DATA[city];
  if (!areas) return null;
  for (const [area, schools] of Object.entries(areas)) {
    if (schools.some((s) => s.name === school)) return area;
  }
  return null;
}

/** Approximate coordinates for a school by name (any area in the city). */
export function schoolLocation(
  city: string,
  school: string
): { lat: number; lng: number } | null {
  const areas = SCHOOL_DATA[city];
  if (!areas) return null;
  for (const schools of Object.values(areas)) {
    const hit = schools.find((s) => s.name === school);
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }
  return null;
}
