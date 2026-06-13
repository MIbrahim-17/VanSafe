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

/**
 * Derive a live status from the most recent pings.
 * - No Signal: latest ping older than 3 minutes (or none).
 * - Moving: travelled > 40 m between the last two pings.
 * - Stopped: otherwise.
 */
export function deriveStatus(pings: LocationPing[]): {
  status: TrackStatus | "no_signal";
  label: string;
} {
  if (pings.length === 0) return { status: "no_signal", label: "No Signal" };
  const latest = pings[0];
  if (minutesAgo(latest.created_at) > 3)
    return { status: "no_signal", label: "No Signal" };
  if (pings.length >= 2) {
    const prev = pings[1];
    const d = distanceMeters(latest.lat, latest.lng, prev.lat, prev.lng);
    if (d > 40) return { status: "moving", label: "Moving" };
  }
  return { status: "stopped", label: "Stopped" };
}

export function occupancyColor(occupancy: number, capacity: number): {
  bar: string;
  text: string;
  label: string;
} {
  const ratio = capacity > 0 ? occupancy / capacity : 1;
  if (ratio >= 0.95)
    return { bar: "bg-rose-500", text: "text-rose-700", label: "Full" };
  if (ratio >= 0.7)
    return { bar: "bg-amber-500", text: "text-amber-700", label: "Filling up" };
  return { bar: "bg-emerald-500", text: "text-emerald-700", label: "Seats available" };
}
