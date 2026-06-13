"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bus, Play, MapPin } from "@/components/icons";

const PING_INTERVAL_MS = 30000;

export default function TrackPage() {
  const [tracking, setTracking] = useState(false);
  const [pings, setPings] = useState(0);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [insecure, setInsecure] = useState(false);
  const [approx, setApprox] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // POST a coordinate to the real tracking endpoint.
  const postCoord = useCallback(async (lat: number, lng: number) => {
    setLastFix({ lat, lng });
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (res.ok) {
      const j = await res.json();
      setPings(j.pingsToday ?? 0);
      setStatus(j.status ?? "moving");
    }
  }, []);

  // Fallback when the device has no GPS / network-location (e.g. a desktop):
  // approximate the location from the IP address so pings still flow.
  const sendApproxPing = useCallback(async () => {
    try {
      const r = await fetch("https://ipwho.is/");
      const j = await r.json();
      if (j?.success && typeof j.latitude === "number") {
        setApprox(true);
        setError("");
        await postCoord(j.latitude, j.longitude);
        return;
      }
    } catch {
      /* ignore */
    }
    setError("Couldn't get your location on this device. Try a phone with GPS enabled.");
  }, [postCoord]);

  const sendPing = useCallback(() => {
    // Phones only allow GPS on a secure origin (HTTPS or localhost). On plain
    // http://<lan-ip> the browser blocks geolocation WITHOUT prompting, so don't
    // even call it — show the HTTPS hint and ping an approximate location.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setInsecure(true);
      sendApproxPing();
      return;
    }
    if (!("geolocation" in navigator)) {
      sendApproxPing();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPermissionBlocked(false);
        setApprox(false);
        setError("");
        postCoord(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        // Real permission denial -> show instructions; anything else (no GPS,
        // network-location failure, timeout) -> fall back to approximate IP.
        if (err.code === err.PERMISSION_DENIED) setPermissionBlocked(true);
        else sendApproxPing();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [postCoord, sendApproxPing]);

  const start = useCallback(() => {
    setError("");
    setTracking(true);
    setPings(0);

    // IMPORTANT: request location synchronously inside the tap. Mobile browsers
    // (esp. iOS Safari) only show the permission prompt when getCurrentPosition
    // is called directly in a user gesture — any `await` before it suppresses
    // the prompt. So fire the ping first, then send the "start" alert after.
    sendPing();

    void fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
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
          className={`mx-auto mb-4 grid h-28 w-28 place-items-center rounded-full ${
            tracking ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          {tracking ? (
            <span className="relative grid place-items-center">
              <span className="absolute h-16 w-16 animate-ping rounded-full bg-emerald-400/40" />
              <MapPin size={44} />
            </span>
          ) : (
            <Bus size={44} />
          )}
        </div>

        {!tracking ? (
          <button onClick={start} className="btn-green w-full py-3 text-lg">
            <Play size={18} /> Start Sharing Location
          </button>
        ) : (
          <button onClick={stop} className="btn-red w-full py-3 text-lg">
            <span className="h-3 w-3 rounded-sm bg-white" /> Stop Sharing
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

        {approx && tracking && !insecure && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            <MapPin size={14} className="mt-px shrink-0" /> Using approximate (network) location — this device has no GPS. On a
            phone with GPS this tracks your exact position.
          </p>
        )}
      </div>

      {insecure && (
        <div className="card border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-800">
          <p className="flex items-center gap-1.5 font-semibold"><MapPin size={16} /> GPS needs a secure (HTTPS) connection</p>
          <p className="mt-1">
            Phones only allow precise GPS over <b>HTTPS</b> or <code>localhost</code>.
            You&apos;re on an <code>http://</code> address, so the browser won&apos;t
            prompt for location. To get real GPS on your phone:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Open the app through an HTTPS tunnel (e.g. <code>ngrok http 3000</code>), or</li>
            <li>Run the dev server with <code>next dev --experimental-https</code>.</li>
          </ul>
          <p className="mt-2">For now, an approximate (city-level) location is being shared so the demo still works.</p>
        </div>
      )}

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
        <Link href="/driver/dashboard" className="text-brand-700">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
