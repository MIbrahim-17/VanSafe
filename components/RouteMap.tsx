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

export default function RouteMap({
  home,
  school,
  stops,
  polyline,
}: {
  home: { lat: number; lng: number };
  school: { lat: number; lng: number; name?: string };
  stops: RouteStop[];
  polyline: [number, number][];
}) {
  const ordered: [number, number][] = [
    [home.lat, home.lng],
    ...stops.map((s) => [s.lat, s.lng] as [number, number]),
    [school.lat, school.lng],
  ];
  const line = polyline.length > 1 ? polyline : ordered;
  const all = [...ordered, ...line];

  return (
    <div className="h-80 overflow-hidden rounded-xl">
      <MapContainer center={ordered[0]} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={line} pathOptions={{ color: "#127240", weight: 5, opacity: 0.85 }} />
        <Marker position={[home.lat, home.lng]} icon={pin("H", "#0f172a")} />
        {stops.map((s) => (
          <Marker key={s.childId} position={[s.lat, s.lng]} icon={pin(String(s.order), "#127240")} />
        ))}
        <Marker position={[school.lat, school.lng]} icon={pin("S", "#b45309")} />
        <FitBounds points={all} />
      </MapContainer>
    </div>
  );
}
