"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { minutesAgo, relativeTime } from "@/lib/utils";
import type { LocationPing } from "@/lib/types";

const NO_SIGNAL_MIN = 10;

/** Emoji van marker — avoids Leaflet's broken default image assets in bundlers. */
const vanIcon = L.divIcon({
  className: "vansafe-van-marker",
  html: `<div style="font-size:28px;line-height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🚐</div>`,
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

export default function LiveMap({ pings }: { pings: LocationPing[] }) {
  // Empty state — driver hasn't started tracking today.
  if (pings.length === 0) {
    return (
      <div className="grid h-72 place-items-center rounded-xl bg-slate-100 text-center">
        <div>
          <div className="text-4xl">🗺️</div>
          <p className="mt-2 text-sm font-medium text-slate-600">
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
              pathOptions={{ color: "#4f46e5", weight: 4, opacity }}
            />
          );
        })}

        <Marker position={[latest.lat, latest.lng]} icon={vanIcon} />
        <Recenter lat={latest.lat} lng={latest.lng} />
      </MapContainer>

      {noSignal && (
        <div className="pointer-events-none absolute right-2 top-2 z-[1000] rounded-full bg-slate-800/85 px-3 py-1 text-xs font-medium text-white shadow">
          ⚠ No Signal · last seen {relativeTime(latest.created_at)}
        </div>
      )}
    </div>
  );
}
