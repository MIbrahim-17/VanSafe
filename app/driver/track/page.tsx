"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const PING_INTERVAL_MS = 30000;

export default function TrackPage() {
  const [tracking, setTracking] = useState(false);
  const [pings, setPings] = useState(0);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPing = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("This device/browser does not support location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLastFix({ lat, lng });
        setPermissionBlocked(false);
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
        if (res.ok) {
          const j = await res.json();
          setPings(j.pingsToday ?? ((p) => p + 1));
          setStatus(j.status ?? "moving");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermissionBlocked(true);
        else setError(err.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  const start = useCallback(async () => {
    setError("");
    await fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    setTracking(true);
    setPings(0);
    sendPing(); // immediate first ping
    timer.current = setInterval(sendPing, PING_INTERVAL_MS);
  }, [sendPing]);

  const stop = useCallback(async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setTracking(false);
    setStatus("idle");
    await fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Tracking</h1>
        <p className="text-sm text-slate-500">
          One tap to start sharing your location with linked parents.
        </p>
      </div>

      <div className="card p-8">
        <div
          className={`mx-auto mb-4 grid h-28 w-28 place-items-center rounded-full text-5xl ${
            tracking ? "animate-pulse bg-emerald-100" : "bg-slate-100"
          }`}
        >
          {tracking ? "📡" : "🚐"}
        </div>

        {!tracking ? (
          <button onClick={start} className="btn-green w-full py-3 text-lg">
            ▶ Start Sharing Location
          </button>
        ) : (
          <button onClick={stop} className="btn-red w-full py-3 text-lg">
            ■ Stop Sharing
          </button>
        )}

        {tracking && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Pings sent today</p>
              <p className="text-2xl font-bold text-slate-900">{pings}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Status</p>
              <p className="text-2xl font-bold capitalize text-slate-900">{status}</p>
            </div>
          </div>
        )}

        {lastFix && (
          <p className="mt-3 text-xs text-slate-400">
            Last fix: {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)}
          </p>
        )}
      </div>

      {permissionBlocked && (
        <div className="card border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-800">
          <p className="font-semibold">Location permission is blocked</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Tap the 🔒 (or ⓘ) icon next to the address bar.</li>
            <li>Find <b>Location</b> and set it to <b>Allow</b>.</li>
            <li>Reload this page and press Start again.</li>
          </ol>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <p className="text-sm text-slate-500">
        Your location is sent automatically every 30 seconds while sharing is on.{" "}
        <Link href="/driver/dashboard" className="text-indigo-600">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
