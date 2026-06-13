"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { minutesAgo, relativeTime } from "@/lib/utils";
import { MapPin } from "./icons";
import type { LocationPing } from "@/lib/types";

const NO_SIGNAL_MIN = 10;

// Inline SVG glyphs (white stroke) for the custom map pins.
const BUS_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`;
const SCHOOL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`;

/** Clean circular SVG markers — avoid Leaflet's broken default image assets. */
const vanIcon = L.divIcon({
  className: "vansafe-van-marker",
  html: `<div class="relative grid h-9 w-9 place-items-center">
    <span class="absolute inline-flex h-9 w-9 animate-ping rounded-full bg-brand-500 opacity-40"></span>
    <span class="relative grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-brand-700 shadow-md">${BUS_SVG}</span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});
const schoolIcon = L.divIcon({
  className: "vansafe-school-marker",
  html: `<span class="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-slate-700 shadow-md">${SCHOOL_SVG}</span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Keeps the map centred on the latest position as new pings arrive. */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

export default function LiveMap({
  pings,
  school,
}: {
  pings: LocationPing[];
  school?: { lat: number; lng: number; name: string } | null;
}) {
  // Empty state — driver hasn't started tracking today.
  if (pings.length === 0) {
    return (
      <div className="grid h-72 place-items-center rounded-xl bg-slate-100 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
            <MapPin size={24} />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Tracking not started yet
          </p>
          <p className="text-sm text-slate-500" dir="rtl">
            ابھی ٹریکنگ شروع نہیں ہوئی
          </p>
        </div>
      </div>
    );
  }

  const latest = pings[0];
  const noSignal = minutesAgo(latest.created_at) > NO_SIGNAL_MIN;

  // Oldest -> newest path for drawing a directional, fading trail.
  const path = [...pings].reverse().map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <div className="relative h-72 overflow-hidden rounded-xl">
      <MapContainer
        center={[latest.lat, latest.lng]}
        zoom={15}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fading route trail: older segments are more transparent. */}
        {path.slice(0, -1).map((from, i) => {
          const to = path[i + 1];
          const opacity = 0.25 + 0.75 * (path.length <= 1 ? 1 : i / (path.length - 1));
          return (
            <Polyline
              key={i}
              positions={[from, to]}
              pathOptions={{ color: "#127240", weight: 4, opacity }}
            />
          );
        })}

        {school && <Marker position={[school.lat, school.lng]} icon={schoolIcon} />}
        <Marker position={[latest.lat, latest.lng]} icon={vanIcon} />
        <Recenter lat={latest.lat} lng={latest.lng} />
      </MapContainer>

      {noSignal && (
        <div className="pointer-events-none absolute right-2 top-2 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-slate-800/85 px-3 py-1 text-xs font-medium text-white shadow">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> No Signal · last seen {relativeTime(latest.created_at)}
        </div>
      )}
    </div>
  );
}
