import type { LocationPing, TrackStatus } from "@/lib/types";

/** Haversine distance in metres between two lat/lng points. */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function whatsappLink(number: string, text = ""): string {
  const digits = number.replace(/[^\d]/g, "");
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${q}`;
}

/** "12.4 km" from metres. */
export function formatKm(metres: number): string {
  return `${(metres / 1000).toFixed(1)} km`;
}

/** "1h 5m" / "23 min" from seconds. */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "Rs 1,240" — rupee amount, rounded. */
export function formatPKR(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-PK")}`;
}

export function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function relativeTime(iso: string): string {
  const m = minutesAgo(iso);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} mins ago`;
  const h = Math.round(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

/** Latest ping older than this (minutes) means we've lost the van's signal.
 *  Shared by the status badge (deriveStatus) and the LiveMap overlay. */
export const NO_SIGNAL_MIN = 3;
/** Pings (drivers ping ~every 30s) that must cluster before a stop is confirmed. */
const STOP_PINGS = 5;
/** "Same location" tolerance in metres — absorbs normal GPS jitter while parked. */
const STOP_RADIUS_M = 40;

/**
 * Derive a live status from the most recent pings (newest first).
 * - No Signal: no pings, or the latest is older than NO_SIGNAL_MIN minutes.
 * - Stopped: the last STOP_PINGS pings are ALL within STOP_RADIUS_M of the latest
 *   (i.e. the van has genuinely been parked for ~2+ minutes).
 * - Moving: any other live signal — so a single stale/jittery ping or a brief
 *   pause at a light never prematurely flips the badge to "Stopped".
 */
export function deriveStatus(pings: LocationPing[]): {
  status: TrackStatus | "no_signal";
  label: string;
} {
  if (pings.length === 0) return { status: "no_signal", label: "No Signal" };
  const latest = pings[0];
  if (minutesAgo(latest.created_at) > NO_SIGNAL_MIN)
    return { status: "no_signal", label: "No Signal" };

  if (pings.length >= STOP_PINGS) {
    const recent = pings.slice(0, STOP_PINGS);
    const stationary = recent.every(
      (p) => distanceMeters(latest.lat, latest.lng, p.lat, p.lng) <= STOP_RADIUS_M
    );
    if (stationary) return { status: "stopped", label: "Stopped" };
  }
  return { status: "moving", label: "Moving" };
}

export interface CapacityStatus {
  /** occupancy / capacity (0–∞). */
  ratio: number;
  /** Clamped 0–100 for progress bars. */
  pct: number;
  /** True when current occupancy exceeds the official capacity. */
  over: boolean;
  /** Tailwind classes for the progress bar fill (the occupied seats). */
  bar: string;
  /** Tailwind bg for the bar track (the free seats) — tinted so an idle van
   *  reads as "seats available" instead of looking blank/white. */
  track: string;
  /** Tailwind classes (bg + text) for a colour-coded badge. */
  badge: string;
  /** Tailwind text colour for inline labels. */
  text: string;
  /** English status label. */
  label: string;
}

/**
 * Colour-code occupancy against the official seating capacity.
 *   green  < 70%        amber 70–90%        red 90–100%
 *   dark red + warning  > official limit (overcrowded)
 */
export function capacityStatus(occupancy: number, capacity: number): CapacityStatus {
  const ratio = capacity > 0 ? occupancy / capacity : occupancy > 0 ? Infinity : 0;
  const pct = capacity > 0 ? Math.min(100, (occupancy / capacity) * 100) : 100;
  const over = capacity > 0 && occupancy > capacity;

  if (over)
    return {
      ratio, pct, over,
      bar: "bg-red-700",
      track: "bg-red-100",
      badge: "bg-red-700 text-white",
      text: "text-red-700",
      label: "Over Capacity — گنجائش سے زیادہ",
    };
  if (ratio >= 0.9)
    return {
      ratio, pct, over,
      bar: "bg-rose-500",
      track: "bg-emerald-100",
      badge: "bg-rose-100 text-rose-700",
      text: "text-rose-700",
      label: "Almost full",
    };
  if (ratio >= 0.7)
    return {
      ratio, pct, over,
      bar: "bg-amber-500",
      track: "bg-emerald-100",
      badge: "bg-amber-100 text-amber-700",
      text: "text-amber-700",
      label: "Filling up",
    };
  return {
    ratio, pct, over,
    bar: "bg-emerald-500",
    track: "bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-700",
    text: "text-emerald-700",
    label: "Seats available",
  };
}
