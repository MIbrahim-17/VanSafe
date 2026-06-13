#!/usr/bin/env node
/**
 * Scrapes real schools (name + exact coordinates) for Lahore & Karachi from
 * OpenStreetMap via the Overpass API, classifies each into a known area, and
 * upserts them into the Supabase `public.schools` table.
 *
 * Prereqs:
 *   1. Run supabase/migration-schools-table.sql in the SQL editor.
 *   2. .env.local must contain NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY
 *      (or SUPABASE_SERVICE_ROLE_KEY).
 *
 * Usage:
 *   node scripts/scrape-schools.mjs            # scrape + write to DB
 *   node scripts/scrape-schools.mjs --dry-run  # scrape + print, no DB writes
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const OVERPASS = "https://overpass-api.de/api/interpreter";

// City bounding boxes [south, west, north, east] and area centroids.
const CITIES = {
  Lahore: {
    bbox: [31.30, 74.15, 31.65, 74.55],
    areas: {
      DHA: [31.471, 74.401],
      Gulberg: [31.514, 74.345],
      "Johar Town": [31.469, 74.27],
      "Model Town": [31.484, 74.323],
      "Bahria Town": [31.367, 74.187],
      Cantt: [31.546, 74.38],
      "Garden Town": [31.502, 74.323],
      "Wapda Town": [31.43, 74.25],
      "Faisal Town": [31.48, 74.305],
      "Allama Iqbal Town": [31.512, 74.281],
      Township: [31.461, 74.317],
      Samanabad: [31.541, 74.3],
      Shadman: [31.546, 74.33],
      Gulberg3: [31.508, 74.349],
    },
  },
  Karachi: {
    bbox: [24.75, 66.95, 25.05, 67.30],
    areas: {
      Clifton: [24.813, 67.03],
      Defence: [24.8, 67.06],
      "Gulshan-e-Iqbal": [24.922, 67.097],
      PECHS: [24.868, 67.06],
      "North Nazimabad": [24.95, 67.04],
      Korangi: [24.835, 67.13],
      "Gulistan-e-Johar": [24.92, 67.13],
      Nazimabad: [24.913, 67.03],
      Saddar: [24.86, 67.02],
      Malir: [24.893, 67.205],
      "Federal B Area": [24.94, 67.07],
      Gulberg: [24.93, 67.06],
      "Shah Faisal": [24.873, 67.155],
      Landhi: [24.852, 67.19],
    },
  },
};

const MAX_AREA_KM = 4; // assign to nearest area centroid within this radius

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function classifyArea(city, lat, lng, suburb) {
  const areas = CITIES[city].areas;
  if (suburb) {
    const hit = Object.keys(areas).find((a) => a.toLowerCase() === suburb.trim().toLowerCase());
    if (hit) return hit;
  }
  let best = null;
  let bestD = Infinity;
  for (const [a, [clat, clng]] of Object.entries(areas)) {
    const d = haversine(lat, lng, clat, clng);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (best && bestD <= MAX_AREA_KM) return best === "Gulberg3" ? "Gulberg" : best;
  if (suburb) return titleCase(suburb.trim());
  return "Other";
}

/** Curated catalog rows from the shared single-source JSON. */
function catalogRows() {
  const data = JSON.parse(readFileSync("lib/schools-data.json", "utf8"));
  const rows = [];
  for (const [city, areas] of Object.entries(data)) {
    for (const [area, schools] of Object.entries(areas)) {
      for (const s of schools) {
        rows.push({ city, area, name: s.name, lat: s.lat, lng: s.lng, source: "catalog" });
      }
    }
  }
  return rows;
}

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall back to process.env */
  }
  return { ...env, ...process.env };
}

async function fetchCity(city) {
  const [s, w, n, e] = CITIES[city].bbox;
  const query = `[out:json][timeout:90];
(
  node["amenity"="school"]["name"](${s},${w},${n},${e});
  way["amenity"="school"]["name"](${s},${w},${n},${e});
);
out center tags;`;

  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "VanSafe-school-scraper/1.0 (hackathon demo)",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${city} failed: ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const rows = [];
  for (const el of data.elements) {
    const name = (el.tags?.name || "").trim();
    if (!name || name.length < 3) continue;
    // Skip names that are purely non-Latin to keep the catalog readable.
    if (!/[A-Za-z]/.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const lat = el.center?.lat ?? el.lat;
    const lng = el.center?.lon ?? el.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const suburb = el.tags["addr:suburb"] || el.tags["addr:neighbourhood"] || "";
    rows.push({ city, area: classifyArea(city, lat, lng, suburb), name, lat, lng, source: "osm" });
  }
  return rows;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  let allRows = [];
  for (const city of Object.keys(CITIES)) {
    process.stdout.write(`Fetching schools for ${city}… `);
    const rows = await fetchCity(city);
    console.log(`${rows.length} found`);
    const byArea = {};
    for (const r of rows) byArea[r.area] = (byArea[r.area] || 0) + 1;
    console.log(
      "  " +
        Object.entries(byArea)
          .sort((a, b) => b[1] - a[1])
          .map(([a, c]) => `${a}:${c}`)
          .join("  ")
    );
    allRows = allRows.concat(rows);
    // Be polite to the public Overpass endpoint.
    await new Promise((r) => setTimeout(r, 2000));
  }

  const catalog = catalogRows();
  console.log(
    `\nTotal: ${catalog.length} curated + ${allRows.length} scraped schools across ${Object.keys(CITIES).length} cities.`
  );

  if (DRY_RUN) {
    console.log("Dry run — nothing written to the database.");
    return;
  }
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  async function writeRows(rows, { keepExisting }) {
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("schools")
        .upsert(chunk, { onConflict: "city,name", ignoreDuplicates: keepExisting });
      if (error) {
        console.error("Upsert error:", error.message);
        process.exit(1);
      }
      written += chunk.length;
      process.stdout.write(`\r  ${written}/${rows.length}…`);
    }
    console.log("");
  }

  // Curated catalog first (authoritative names/areas/coords for the demo)…
  console.log("Writing curated catalog…");
  await writeRows(catalog, { keepExisting: false });
  // …then OSM, skipping any name a curated row already owns.
  console.log("Writing scraped OSM schools…");
  await writeRows(allRows, { keepExisting: true });

  console.log(`\n✓ Done. Curated + scraped schools written to public.schools.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
