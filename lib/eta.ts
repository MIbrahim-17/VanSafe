/**
 * ETA engine (server-only) — estimates travel time between two points, used by
 * the traffic-delay notifications and the WhatsApp "when will the van reach
 * school/home?" replies.
 *
 * Hybrid, mirroring lib/routing.ts: Google Directions (traffic-aware) when
 * GOOGLE_MAPS_API_KEY is set, else keyless OSRM, else a straight-line haversine
 * estimate. Only Google exposes a live-traffic duration, so `delayS` (current vs
 * typical) is 0 on the fallbacks.
 */
import "server-only";
import { distanceMeters } from "@/lib/utils";
import type { RouteEngine } from "@/lib/types";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Eta {
  distanceM: number;
  /** Typical / free-flow duration. */
  durationS: number;
  /** Current duration including live traffic (== durationS when unknown). */
  durationTrafficS: number;
  /** Extra time vs typical due to traffic: max(0, durationTrafficS - durationS). */
  delayS: number;
  engine: RouteEngine;
}

async function googleEta(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  traffic: boolean
): Promise<Eta | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    key,
  });
  if (waypoints.length)
    params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  if (traffic) {
    params.set("departure_time", "now");
    params.set("traffic_model", "best_guess");
  }
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      routes: {
        legs: {
          distance: { value: number };
          duration: { value: number };
          duration_in_traffic?: { value: number };
        }[];
      }[];
    };
    const route = json.routes?.[0];
    if (json.status !== "OK" || !route) return null;
    let distanceM = 0;
    let durationS = 0;
    let durationTrafficS = 0;
    for (const leg of route.legs) {
      distanceM += leg.distance.value;
      durationS += leg.duration.value;
      durationTrafficS += leg.duration_in_traffic?.value ?? leg.duration.value;
    }
    return {
      distanceM,
      durationS,
      durationTrafficS,
      delayS: Math.max(0, durationTrafficS - durationS),
      engine: "google",
    };
  } catch {
    return null;
  }
}

async function osrmEta(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[]
): Promise<Eta | null> {
  const coords = [origin, ...waypoints, destination]
    .map((c) => `${c.lng},${c.lat}`)
    .join(";");
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code: string;
      routes: { distance: number; duration: number }[];
    };
    const route = json.routes?.[0];
    if (json.code !== "Ok" || !route) return null;
    return {
      distanceM: route.distance,
      durationS: route.duration,
      durationTrafficS: route.duration,
      delayS: 0,
      engine: "osrm",
    };
  } catch {
    return null;
  }
}

/** Straight-line fallback: inflate ~30% for real roads, ~22 km/h city speed. */
function haversineEta(origin: LatLng, destination: LatLng, waypoints: LatLng[]): Eta {
  const pts = [origin, ...waypoints, destination];
  let distanceM = 0;
  for (let i = 1; i < pts.length; i++) {
    distanceM += distanceMeters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  }
  distanceM *= 1.3;
  const durationS = (distanceM / 1000 / 22) * 3600;
  return { distanceM, durationS, durationTrafficS: durationS, delayS: 0, engine: "haversine" };
}

/** Estimate travel time origin -> destination (optional intermediate waypoints). */
export async function estimateEta(
  origin: LatLng,
  destination: LatLng,
  opts: { waypoints?: LatLng[]; traffic?: boolean } = {}
): Promise<Eta> {
  const waypoints = opts.waypoints ?? [];
  const traffic = opts.traffic ?? false;
  return (
    (await googleEta(origin, destination, waypoints, traffic)) ??
    (await osrmEta(origin, destination, waypoints)) ??
    haversineEta(origin, destination, waypoints)
  );
}
