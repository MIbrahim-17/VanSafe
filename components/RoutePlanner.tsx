"use client";

/**
 * RoutePlanner — the driver's morning/afternoon route screen.
 * Build & save a base route, mark attendance, optimize, view it on a map with
 * distance/time/fuel + savings, and start the route (GPS + parent alerts).
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Route, Play, Check, X, Sparkles } from "@/components/icons";
import { formatKm, formatDuration, formatPKR } from "@/lib/utils";
import type {
  AttendanceStatus,
  BaseRoute,
  OptimizeResult,
  RoutePeriod,
} from "@/lib/types";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100" />,
});

export interface ChildLite {
  id: string;
  name: string;
  school: string;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
}
export interface SchoolOption {
  name: string;
  lat: number;
  lng: number;
}

const ENGINE_LABEL: Record<string, string> = {
  google: "Live traffic (Google)",
  osrm: "Road distances",
  haversine: "Estimated — maps temporarily unavailable",
};

async function geocodeClient(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pk&q=${encodeURIComponent(q)}`
    );
    const j = (await r.json()) as { lat: string; lon: string }[];
    if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon };
  } catch {
    /* ignore */
  }
  return null;
}

export default function RoutePlanner({
  base,
  childList,
  attendance,
  schoolOptions,
  city,
}: {
  base: BaseRoute | null;
  childList: ChildLite[];
  attendance: Record<string, AttendanceStatus>;
  schoolOptions: SchoolOption[];
  city: string;
}) {
  const byId = useMemo(() => new Map(childList.map((c) => [c.id, c])), [childList]);

  // Manual order: saved order first (still-linked), then any new children.
  const [order, setOrder] = useState<string[]>(() => {
    const saved = (base?.child_order ?? []).filter((id) => byId.has(id));
    const extra = childList.map((c) => c.id).filter((id) => !saved.includes(id));
    return [...saved, ...extra];
  });

  const [present, setPresent] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const c of childList) m[c.id] = attendance[c.id] !== "absent";
    return m;
  });

  const [homeAddress, setHomeAddress] = useState(base?.home_address ?? "");
  const [homeLat, setHomeLat] = useState<number | null>(base?.home_lat ?? null);
  const [homeLng, setHomeLng] = useState<number | null>(base?.home_lng ?? null);
  const [schoolName, setSchoolName] = useState(base?.school_name ?? "");
  const [fuelAvg, setFuelAvg] = useState(String(base?.fuel_avg_kmpl ?? 10));

  const [period, setPeriod] = useState<RoutePeriod>("morning");
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [emptyMsg, setEmptyMsg] = useState("");

  const [savingBase, setSavingBase] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const school = schoolOptions.find((s) => s.name === schoolName) ?? null;

  function hasCoords(id: string) {
    const c = byId.get(id);
    return !!c && c.pickup_lat != null && c.pickup_lng != null;
  }
  const presentRoutableIds = order.filter((id) => present[id] && hasCoords(id));

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }

  async function toggleAttendance(id: string) {
    const nextPresent = !present[id];
    setPresent((p) => ({ ...p, [id]: nextPresent }));
    setResult(null);
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: id, status: nextPresent ? "present" : "absent" }),
    });
  }

  async function saveBase() {
    setSavingBase(true);
    setSavedMsg("");
    setError("");
    let hLat = homeLat;
    let hLng = homeLng;
    if ((hLat == null || hLng == null) && homeAddress.trim()) {
      const geo = await geocodeClient(`${homeAddress}, ${city}`);
      if (geo) {
        hLat = geo.lat;
        hLng = geo.lng;
        setHomeLat(hLat);
        setHomeLng(hLng);
      }
    }
    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home_address: homeAddress,
        home_lat: hLat,
        home_lng: hLng,
        school_name: schoolName,
        school_lat: school?.lat ?? null,
        school_lng: school?.lng ?? null,
        child_order: order,
        fuel_avg_kmpl: Number(fuelAvg) || 10,
      }),
    });
    setSavingBase(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not save base route.");
      return;
    }
    setSavedMsg("Base route saved — it will load automatically each morning.");
  }

  function detectLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setHomeLat(pos.coords.latitude);
      setHomeLng(pos.coords.longitude);
      if (!homeAddress) setHomeAddress("Current location");
    });
  }

  async function optimize() {
    setError("");
    setEmptyMsg("");
    setResult(null);
    setStarted(false);
    if (homeLat == null || !school) {
      setError("Set your home location and destination school, then save the base route.");
      return;
    }
    if (presentRoutableIds.length === 0) {
      setEmptyMsg("No children present today — آج کوئی بچہ موجود نہیں");
      return;
    }
    setOptimizing(true);
    const res = await fetch("/api/route/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, presentChildIds: presentRoutableIds }),
    });
    setOptimizing(false);
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Optimization failed.");
      return;
    }
    if (j.empty) {
      setEmptyMsg(j.error ?? "No children present today — آج کوئی بچہ موجود نہیں");
      return;
    }
    setResult(j as OptimizeResult);
  }

  async function startRoute() {
    await fetch("/api/route/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, presentChildIds: presentRoutableIds }),
    });
    setStarted(true);
  }

  return (
    <div className="space-y-6">
      {/* Base route setup */}
      <div className="card space-y-4 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Route size={18} className="text-brand-700" /> Base route
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Starting point (home)</label>
            <div className="flex gap-2">
              <input
                className="input"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="Your home address"
              />
              <button type="button" onClick={detectLocation} className="btn-ghost shrink-0" title="Use current location">
                <MapPin size={16} />
              </button>
            </div>
            {homeLat != null && (
              <p className="mt-1 text-xs text-emerald-600">
                <Check size={12} /> Location set
              </p>
            )}
          </div>
          <div>
            <label className="label">Destination school</label>
            <select className="input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)}>
              <option value="">Select destination school…</option>
              {schoolOptions.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Vehicle fuel average (km/L)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={40}
              step="0.1"
              value={fuelAvg}
              onChange={(e) => setFuelAvg(e.target.value)}
            />
          </div>
        </div>

        {/* Children / pickup order */}
        <div>
          <p className="label">Pickup order — drag to reorder</p>
          {order.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              No children linked yet. Parents who link to your van appear here automatically.
            </p>
          ) : (
            <ul className="space-y-2">
              {order.map((id, i) => {
                const c = byId.get(id);
                if (!c) return null;
                const missing = c.pickup_lat == null || c.pickup_lng == null;
                const isPresent = present[id];
                return (
                  <li
                    key={id}
                    draggable
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder(id)}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      isPresent ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-60"
                    }`}
                  >
                    <span className="cursor-grab select-none text-slate-300" aria-hidden>⠿</span>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {c.pickup_address || c.school || "—"}
                      </p>
                    </div>
                    {missing ? (
                      <span className="badge bg-rose-100 text-rose-700">Address missing — پتہ درج نہیں</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleAttendance(id)}
                        className={`badge ${isPresent ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                      >
                        {isPresent ? <><Check size={12} /> Present</> : <><X size={12} /> Absent</>}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveBase} disabled={savingBase} className="btn-ghost">
            {savingBase ? "Saving…" : "Save base route"}
          </button>
          {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
        </div>
      </div>

      {/* Optimize */}
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles size={18} className="text-brand-700" /> Optimize today&apos;s route
          </h2>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(["morning", "afternoon"] as RoutePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  setResult(null);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  period === p ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-500">
          {period === "morning"
            ? "Most time-efficient pickup order using live morning traffic, ending at school."
            : "Most fuel-efficient drop-off order from school back to each present child's home."}
        </p>

        <button onClick={optimize} disabled={optimizing} className="btn-primary">
          {optimizing
            ? "Optimizing…"
            : period === "morning"
            ? "Optimize Morning Route — صبح کا راستہ بہتر بنائیں"
            : "Optimize Afternoon Route — شام کا راستہ بہتر بنائیں"}
        </button>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {emptyMsg && (
          <div className="rounded-lg bg-amber-50 p-4 text-center text-sm font-medium text-amber-800">
            {emptyMsg}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{result.stops.length} stops</span>
              <span className="badge bg-slate-100 text-slate-500">{ENGINE_LABEL[result.engine]}</span>
            </div>

            <RouteMap
              home={{ lat: homeLat as number, lng: homeLng as number }}
              school={{ lat: school!.lat, lng: school!.lng, name: school!.name }}
              stops={result.stops}
              polyline={result.polyline}
            />

            {/* Today's estimates */}
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Distance" value={formatKm(result.optimizedDistanceM)} />
              <Stat label="Est. time" value={formatDuration(result.durationS)} />
              <Stat label="Fuel cost" value={formatPKR(result.fuelCost)} />
            </div>

            {/* Optimized vs original comparison */}
            <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
              <p className="text-sm font-semibold text-brand-900">Optimized vs your original order</p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                <Saved label="Distance saved" value={formatKm(result.distanceSavedM)} />
                <Saved label="Time saved" value={formatDuration(result.timeSavedS)} />
                <Saved label="Saved" value={formatPKR(result.fuelSaved)} highlight />
              </div>
            </div>

            {/* Numbered stop list */}
            <ol className="space-y-1 text-sm">
              <li className="flex items-center gap-2 text-slate-500">
                <Pin label="H" /> {homeAddress || "Home"}
              </li>
              {result.stops.map((s) => (
                <li key={s.childId} className="flex items-center gap-2 text-slate-700">
                  <Pin label={String(s.order)} /> {s.name}
                </li>
              ))}
              <li className="flex items-center gap-2 text-slate-500">
                <Pin label="S" amber /> {school?.name}
              </li>
            </ol>

            {started ? (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                <Check size={14} /> Route started — GPS tracking on, parents notified.
              </p>
            ) : (
              <button onClick={startRoute} className="btn-green w-full py-3 text-base">
                <Play size={18} /> Start Route — راستہ شروع کریں
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Saved({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-brand-700/70">{label}</p>
      <p className={`mt-0.5 font-bold ${highlight ? "text-xl text-brand-700" : "text-brand-800"}`}>
        {value}
      </p>
    </div>
  );
}

function Pin({ label, amber }: { label: string; amber?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
        amber ? "bg-amber-600" : label === "H" ? "bg-slate-800" : "bg-brand-600"
      }`}
    >
      {label}
    </span>
  );
}
