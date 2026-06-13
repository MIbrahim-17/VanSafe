"use client";

/**
 * DEMO MODE 🎬 — fully self-contained. Delete this file + its <DemoMode/> usage
 * in the parent dashboard + app/api/demo/route.ts to remove the feature entirely.
 *
 * Drives a simulated van along a pre-defined Lahore route by POSTing REAL pings
 * to /api/demo, so the live map + alerts on the dashboard react exactly as they
 * would for a real driver. No production tracking code is touched.
 */
import { useMemo, useRef, useState, useEffect } from "react";

type LatLng = [number, number];
type Status = "idle" | "running" | "paused" | "done";

interface Route {
  id: string;
  name: string;
  waypoints: LatLng[];
}

// Approximate road paths across Lahore.
const ROUTES: Route[] = [
  {
    id: "dha-beaconhouse",
    name: "DHA Phase 5 → Beaconhouse School",
    waypoints: [
      [31.472, 74.41], [31.476, 74.406], [31.4805, 74.4015], [31.485, 74.3975],
      [31.49, 74.394], [31.495, 74.391], [31.5, 74.388], [31.5045, 74.385],
    ],
  },
  {
    id: "gulberg-lgs",
    name: "Gulberg → LGS Johar Town",
    waypoints: [
      [31.516, 74.35], [31.512, 74.342], [31.508, 74.334], [31.503, 74.326],
      [31.498, 74.318], [31.493, 74.31], [31.4895, 74.303],
    ],
  },
  {
    id: "model-cityschool",
    name: "Model Town → The City School Faisal Town",
    waypoints: [
      [31.484, 74.326], [31.4805, 74.321], [31.477, 74.316], [31.4735, 74.311],
      [31.47, 74.306],
    ],
  },
];

const SPACING_M = 40; // metres between simulated pings
const DELAY: Record<"normal" | "fast", number> = { normal: 4000, fast: 1500 };

/** Equirectangular metre distance (self-contained — no shared imports). */
function metres(a: LatLng, b: LatLng): number {
  const x = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  const y = (b[0] - a[0]) * 111320;
  return Math.hypot(x, y);
}

/** Interpolate waypoints into evenly-spaced steps (~SPACING_M apart). */
function buildSteps(waypoints: LatLng[]): LatLng[] {
  const steps: LatLng[] = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const n = Math.max(1, Math.round(metres(a, b) / SPACING_M));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      steps.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return steps;
}

export default function DemoMode({ driverId }: { driverId: string }) {
  const [routeId, setRouteId] = useState(ROUTES[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const steps = useMemo(
    () => buildSteps(ROUTES.find((r) => r.id === routeId)!.waypoints),
    [routeId]
  );
  const stopIdx = Math.floor(steps.length * 0.55);

  // Refs so the interval callback always sees current values.
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => () => stopTimer(), []);

  async function post(action: string, point?: LatLng) {
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        driverId,
        lat: point?.[0],
        lng: point?.[1],
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Demo request failed.");
    }
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(tick, DELAY[speed]);
  }

  function tick() {
    const s = stepsRef.current;
    const i = idxRef.current + 1;
    if (i >= s.length) {
      stopTimer();
      setStatus("done");
      return;
    }
    idxRef.current = i;
    setProgress(i);

    if (i === s.length - 1) {
      post("arrive", s[i]); // final ping + arrived alert
      stopTimer();
      setStatus("done");
      return;
    }
    post("ping", s[i]);
    if (i === stopIdx) post("stopped"); // mid-route safety alert
  }

  async function start() {
    setError("");
    idxRef.current = 0;
    setProgress(0);
    setStatus("running");
    await post("depart", steps[0]);
    startTimer();
  }

  function pause() {
    stopTimer();
    setStatus("paused");
  }

  function resume() {
    setStatus("running");
    startTimer();
  }

  async function reset() {
    stopTimer();
    setStatus("idle");
    idxRef.current = 0;
    setProgress(0);
    await post("reset");
  }

  function changeSpeed(next: "normal" | "fast") {
    setSpeed(next);
    if (status === "running") {
      stopTimer();
      timerRef.current = setInterval(tick, DELAY[next]);
    }
  }

  const pct = steps.length > 1 ? Math.round((progress / (steps.length - 1)) * 100) : 0;

  return (
    <div className="card border-2 border-dashed border-fuchsia-300 bg-fuchsia-50/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-fuchsia-800">Demo Mode 🎬</h2>
        <span className="badge bg-fuchsia-200 text-fuchsia-800 capitalize">{status}</span>
      </div>
      <p className="mb-3 text-xs text-fuchsia-700/80">
        Simulates a van on a Lahore route — writes real pings, so the map &amp; alerts
        above react exactly like a live driver.
      </p>

      <label className="label">Route</label>
      <select
        className="input mb-3"
        value={routeId}
        onChange={(e) => setRouteId(e.target.value)}
        disabled={status === "running" || status === "paused"}
      >
        {ROUTES.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      {(status === "running" || status === "paused" || status === "done") && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-xs text-fuchsia-700">
            <span>{status === "done" ? "Arrived 🏫" : `Step ${progress}/${steps.length - 1}`}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-fuchsia-100">
            <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Speed:</span>
        {(["normal", "fast"] as const).map((s) => (
          <button
            key={s}
            onClick={() => changeSpeed(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              speed === s
                ? "bg-fuchsia-600 text-white"
                : "border border-slate-300 bg-white text-slate-600"
            }`}
          >
            {s === "normal" ? "Normal (~36 km/h)" : "Fast"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "idle" || status === "done" ? (
          <button onClick={start} className="btn bg-fuchsia-600 text-white hover:bg-fuchsia-700">
            ▶ Start Simulation — سمولیشن شروع کریں
          </button>
        ) : status === "running" ? (
          <button onClick={pause} className="btn-ghost">⏸ Pause</button>
        ) : (
          <button onClick={resume} className="btn bg-fuchsia-600 text-white hover:bg-fuchsia-700">
            ▶ Resume
          </button>
        )}
        {status !== "idle" && (
          <button onClick={reset} className="btn-ghost">↺ Reset</button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
