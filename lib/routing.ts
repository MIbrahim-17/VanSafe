/**
 * Route optimization engine (server-only).
 *
 * Stop order is chosen with a nearest-neighbour heuristic, then real road
 * distance/time is measured with the Google Directions API (traffic-aware for
 * morning routes). When no Google key is set or a call fails, it falls back to
 * keyless OSRM, then to straight-line haversine — so optimization always works.
 */
import "server-only";
import { distanceMeters } from "@/lib/utils";
import { fuelCostPKR } from "@/lib/constants";
import type { OptimizeResult, RouteEngine, RoutePeriod, RouteStop } from "@/lib/types";

export interface LatLng {
  lat: number;
  lng: number;
}
export interface StopInput extends LatLng {
  childId: string;
  name: string;
}

interface Metrics {
  distanceM: number;
  durationS: number;
  polyline: [number, number][];
  engine: RouteEngine;
}

/** Greedy nearest-neighbour ordering of stops starting from `origin`. */
export function nearestNeighbour<T extends LatLng>(origin: LatLng, stops: T[]): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let cur: LatLng = origin;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceMeters(cur.lat, cur.lng, remaining[i].lat, remaining[i].lng);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cur = remaining[best];
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
}

/** Decode a Google encoded polyline into [lat,lng] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

async function googleMetrics(
  ordered: LatLng[],
  useTraffic: boolean
): Promise<Metrics | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || ordered.length < 2) return null;
  const origin = ordered[0];
  const destination = ordered[ordered.length - 1];
  const waypoints = ordered.slice(1, -1);
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    key,
  });
  if (waypoints.length)
    params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  if (useTraffic) {
    params.set("departure_time", "now");
    params.set("traffic_model", "best_guess");
  }
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      routes: {
        overview_polyline: { points: string };
        legs: { distance: { value: number }; duration: { value: number }; duration_in_traffic?: { value: number } }[];
      }[];
    };
    const route = json.routes?.[0];
    if (json.status !== "OK" || !route) return null;
    let distanceM = 0;
    let durationS = 0;
    for (const leg of route.legs) {
      distanceM += leg.distance.value;
      durationS += (useTraffic && leg.duration_in_traffic?.value) || leg.duration.value;
    }
    return {
      distanceM,
      durationS,
      polyline: decodePolyline(route.overview_polyline.points),
      engine: "google",
    };
  } catch {
    return null;
  }
}

async function osrmMetrics(ordered: LatLng[]): Promise<Metrics | null> {
  if (ordered.length < 2) return null;
  const coordStr = ordered.map((c) => `${c.lng},${c.lat}`).join(";");
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code: string;
      routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const route = json.routes?.[0];
    if (json.code !== "Ok" || !route) return null;
    return {
      distanceM: route.distance,
      durationS: route.duration,
      polyline: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      engine: "osrm",
    };
  } catch {
    return null;
  }
}

/** Straight-line fallback: sum haversine legs, estimate time at ~22 km/h city speed. */
function haversineMetrics(ordered: LatLng[]): Metrics {
  let distanceM = 0;
  for (let i = 1; i < ordered.length; i++) {
    distanceM += distanceMeters(
      ordered[i - 1].lat, ordered[i - 1].lng, ordered[i].lat, ordered[i].lng
    );
  }
  // City roads aren't straight — inflate ~30% and estimate time at 22 km/h.
  distanceM *= 1.3;
  return {
    distanceM,
    durationS: (distanceM / 1000 / 22) * 3600,
    polyline: ordered.map((c) => [c.lat, c.lng] as [number, number]),
    engine: "haversine",
  };
}

async function measure(ordered: LatLng[], useTraffic: boolean): Promise<Metrics> {
  return (
    (await googleMetrics(ordered, useTraffic)) ??
    (await osrmMetrics(ordered)) ??
    haversineMetrics(ordered)
  );
}

/**
 * Optimize a route: nearest-neighbour order vs the driver's manual order, both
 * measured on real roads, returning the optimized route plus the savings.
 */
export async function optimizeRoute(opts: {
  origin: LatLng;
  stops: StopInput[];
  destination: LatLng;
  period: RoutePeriod;
  fuelKmpl: number;
}): Promise<OptimizeResult> {
  const { origin, stops, destination, period, fuelKmpl } = opts;
  const useTraffic = period === "morning"; // mornings are time/traffic sensitive

  const optimizedStops = nearestNeighbour(origin, stops);

  const unoptOrder: LatLng[] = [origin, ...stops, destination];
  const optOrder: LatLng[] = [origin, ...optimizedStops, destination];

  const [unopt, opt] = await Promise.all([
    measure(unoptOrder, useTraffic),
    measure(optOrder, useTraffic),
  ]);

  // Never present a negative saving — if NN didn't beat the manual order, the
  // optimized route is effectively the manual one.
  const distanceSavedM = Math.max(0, unopt.distanceM - opt.distanceM);
  const timeSavedS = Math.max(0, unopt.durationS - opt.durationS);
  const optCost = fuelCostPKR(opt.distanceM, fuelKmpl);
  const unoptCost = fuelCostPKR(unopt.distanceM, fuelKmpl);
  const fuelSaved = Math.max(0, unoptCost - optCost);

  const routeStops: RouteStop[] = optimizedStops.map((s, i) => ({
    childId: s.childId,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    order: i + 1,
  }));

  return {
    period,
    engine: opt.engine,
    stops: routeStops,
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    polyline: opt.polyline,
    optimizedDistanceM: opt.distanceM,
    unoptimizedDistanceM: unopt.distanceM,
    durationS: opt.durationS,
    fuelCost: optCost,
    fuelSaved,
    distanceSavedM,
    timeSavedS,
  };
}
