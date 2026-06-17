"use client";

/**
 * RouteMap — renders an optimized route on a Leaflet/OSM map (keyless) with
 * numbered stop markers and the road polyline (decoded from Google/OSRM).
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteStop } from "@/lib/types";

function pin(label: string, bg: string) {
  return L.divIcon({
    className: "vansafe-route-pin",
    html: `<span class="grid h-7 w-7 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md" style="background:${bg}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export interface RouteEndpoint {
  lat: number;
  lng: number;
  label: string;
  color: string;
}

export default function RouteMap({
  start,
  end,
  stops,
  polyline,
}: {
  start: RouteEndpoint;
  end: RouteEndpoint;
  stops: RouteStop[];
  polyline: [number, number][];
}) {
  // Markers and the straight-line fallback follow the actual travel direction:
  // start -> ordered stops -> end (drop-off). The road polyline already does.
  const ordered: [number, number][] = [
    [start.lat, start.lng],
    ...stops.map((s) => [s.lat, s.lng] as [number, number]),
    [end.lat, end.lng],
  ];
  const line = polyline.length > 1 ? polyline : ordered;
  const all = [...ordered, ...line];

  // react-leaflet's MapContainer ignores prop changes after mount (center/zoom
  // are read once). Keying it to the route forces a fresh map whenever the
  // start/end or stops change, so a re-optimized route never stays "stuck".
  const routeKey = ordered.map(([la, ln]) => `${la.toFixed(5)},${ln.toFixed(5)}`).join("|");

  return (
    <div className="h-80 overflow-hidden rounded-xl">
      <MapContainer key={routeKey} center={ordered[0]} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={line} pathOptions={{ color: "#127240", weight: 5, opacity: 0.85 }} />
        <Marker position={[start.lat, start.lng]} icon={pin(start.label, start.color)} />
        {stops.map((s) => (
          <Marker key={s.childId} position={[s.lat, s.lng]} icon={pin(String(s.order), "#127240")} />
        ))}
        <Marker position={[end.lat, end.lng]} icon={pin(end.label, end.color)} />
        <FitBounds points={all} />
      </MapContainer>
    </div>
  );
}
