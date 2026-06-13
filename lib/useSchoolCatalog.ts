"use client";

import { useEffect, useMemo, useState } from "react";
import { SCHOOL_DATA } from "@/lib/schools";

/**
 * City -> Area -> School catalog for the pickers. Merges the scraped DB schools
 * (/api/schools) with the built-in static catalog, so the UI works immediately
 * (static) and gets richer once the scraper has populated the `schools` table.
 */
export function useSchoolCatalog(city: string) {
  const [dbByArea, setDbByArea] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!city) {
      setDbByArea({});
      return;
    }
    let active = true;
    fetch(`/api/schools?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((j) => {
        if (active) setDbByArea(j.byArea ?? {});
      })
      .catch(() => {
        if (active) setDbByArea({});
      });
    return () => {
      active = false;
    };
  }, [city]);

  return useMemo(() => {
    // DB is the single source of truth once populated; the static catalog is a
    // bootstrap fallback used only when the `schools` table is empty/unscraped.
    let source: Record<string, string[]>;
    if (Object.keys(dbByArea).length > 0) {
      source = dbByArea;
    } else {
      source = {};
      for (const [area, schools] of Object.entries(SCHOOL_DATA[city] ?? {})) {
        source[area] = schools.map((s) => s.name);
      }
    }

    const merged: Record<string, string[]> = {};
    for (const [area, names] of Object.entries(source)) {
      merged[area] = Array.from(new Set(names)).sort();
    }

    const areas = Object.keys(merged).sort();
    return {
      hasCatalog: areas.length > 0,
      getAreas: () => areas,
      getSchools: (area: string) => merged[area] ?? [],
      areaOfSchool: (name: string) =>
        areas.find((a) => merged[a].includes(name)) ?? null,
    };
  }, [city, dbByArea]);
}
