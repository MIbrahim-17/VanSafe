"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { deriveStatus, googleMapsLink, relativeTime, whatsappLink } from "@/lib/utils";
import type { LocationPing } from "@/lib/types";

// Leaflet touches `window`, so the map is client-only (no SSR).
const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-slate-100" />,
});

const STATUS_STYLES: Record<string, string> = {
  moving: "bg-emerald-100 text-emerald-700",
  stopped: "bg-amber-100 text-amber-700",
  no_signal: "bg-slate-200 text-slate-600",
  idle: "bg-slate-200 text-slate-600",
};

export default function LiveStatusPanel({
  driverId,
  driverName,
  driverWhatsapp,
}: {
  driverId: string;
  driverName: string;
  driverWhatsapp: string;
}) {
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/locations?driverId=${driverId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setPings(j.history ?? []);
      }
    } finally {
      setLoaded(true);
    }
  }, [driverId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const { status, label } = deriveStatus(pings);
  const latest = pings[0];

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Live tracking — {driverName}</h2>
        <span className={`badge ${STATUS_STYLES[status]}`}>● {label}</span>
      </div>

      {!loaded ? (
        <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <>
          <LiveMap pings={pings} />

          {latest && (
            <>
          <p className="mt-3 text-sm text-slate-600">
            Last location received{" "}
            <span className="font-medium text-slate-800">
              {relativeTime(latest.created_at)}
            </span>
            .
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="btn-primary"
              href={googleMapsLink(latest.lat, latest.lng)}
              target="_blank"
              rel="noreferrer"
            >
              📍 Open in Google Maps
            </a>
            <a
              className="btn-green"
              href={whatsappLink(driverWhatsapp, "Hi, checking in on the van.")}
              target="_blank"
              rel="noreferrer"
            >
              💬 WhatsApp driver
            </a>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Recent route (last {Math.min(pings.length, 10)} pings)
            </h3>
            <ol className="space-y-1 text-xs text-slate-500">
              {pings.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <a
                    className="text-indigo-600 hover:underline"
                    href={googleMapsLink(p.lat, p.lng)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                  </a>
                  <span>{relativeTime(p.created_at)}</span>
                </li>
              ))}
            </ol>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
