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
import { useRouter } from "next/navigation";
import { Play, Pause, Reset, Sparkles } from "./icons";

type LatLng = [number, number];
type Status = "idle" | "running" | "paused" | "done";
/** Gulshan scenarios drive the real detection engine; undefined = legacy route. */
type Scenario = "normal" | "unusual" | undefined;

interface Route {
  id: string;
  name: string;
  waypoints: LatLng[];
  scenario?: Scenario;
  /** Normal scenario: where the child is collected (drives the pickup narrative). */
  pickup?: LatLng;
}

const ROUTES: Route[] = [
  // --- Gulshan-e-Iqbal scenarios (Imran's van / Ayesha) — drive real alerts ---
  {
    id: "gulshan-ayesha-normal",
    name: "Gulshan: Ayesha → The City School (normal)",
    scenario: "normal",
    pickup: [24.92, 67.095],
    // Driver's start → Ayesha's home (pickup) → The City School Gulshan
    // (24.922,67.09, matching the catalog marker): arriving-soon → picked up →
    // departed → ETA → arrived.
    waypoints: [
      [24.918, 67.0971], [24.919, 67.0961], [24.92, 67.095],
      [24.9208, 67.0928], [24.9215, 67.0912], [24.922, 67.09],
    ],
  },
  {
    id: "gulshan-imran-unusual",
    name: "Gulshan: Imran — unusual route ⚠️",
    scenario: "unusual",
    // Starts normally, then veers ~2 km west of the usual corridor: departed →
    // traffic-delay → stationary → route-deviation → arrived.
    waypoints: [
      [24.918, 67.0971], [24.9188, 67.0979], [24.9196, 67.0986],
      [24.918, 67.093], [24.916, 67.088], [24.914, 67.082], [24.9122, 67.0782],
    ],
  },
  // --- Approximate road paths across Lahore (generic, no real-engine hooks) ---
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

export interface DemoTarget {
  childId: string;
  childName: string;
  driverId: string;
  driverName: string;
}

export default function DemoMode({ targets }: { targets: DemoTarget[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(targets[0]?.childId ?? "");
  const active = targets.find((t) => t.childId === selectedId) ?? targets[0];

  const [routeId, setRouteId] = useState(ROUTES[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const route = useMemo(() => ROUTES.find((r) => r.id === routeId)!, [routeId]);
  const steps = useMemo(() => buildSteps(route.waypoints), [route]);
  const scenario = route.scenario;
  // Where a scripted stop (stationary) fires: only the unusual scenario and the
  // legacy Lahore routes have one; the clean "normal" scenario has none.
  const stopIdx =
    scenario === "unusual"
      ? Math.floor(steps.length * 0.4)
      : scenario === "normal"
      ? -1
      : Math.floor(steps.length * 0.55);

  // Normal scenario: the step where the van reaches the child's home (pickup),
  // used to script the picked-up / departed / ETA narrative.
  const pickupIdx = useMemo(() => {
    if (scenario !== "normal" || !route.pickup) return -1;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const d = metres(steps[i], route.pickup);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }, [steps, route, scenario]);

  // Refs so the interval callback always sees current values.
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const driverIdRef = useRef(active.driverId);
  driverIdRef.current = active.driverId;
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const stopIdxRef = useRef(stopIdx);
  stopIdxRef.current = stopIdx;
  const pickupIdxRef = useRef(pickupIdx);
  pickupIdxRef.current = pickupIdx;

  useEffect(() => () => stopTimer(), []);

  async function post(action: string, point?: LatLng) {
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        driverId: driverIdRef.current,
        scenario: scenarioRef.current,
        lat: point?.[0],
        lng: point?.[1],
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Demo request failed.");
    }
    // Re-fetch the dashboard's server-rendered alerts feed so new alerts show
    // live without a manual refresh.
    router.refresh();
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
    if (i === stopIdxRef.current) post("stopped"); // scripted stationary alert

    // Normal scenario pickup narrative: reach home -> picked up, then depart +
    // ETA to school. (arriving-soon already fired organically before this.)
    const pIdx = pickupIdxRef.current;
    if (pIdx >= 0) {
      if (i === pIdx) post("pickup_arrived", s[i]);
      if (i === pIdx + 2) {
        post("pickup_departed", s[i]);
        post("eta_school", s[i]);
      }
    }
  }

  async function start() {
    setError("");
    idxRef.current = 0;
    setProgress(0);
    setStatus("running");
    await post("depart", steps[0]);
    // Unusual scenario: warn about heavy traffic right after departure.
    if (scenario === "unusual") await post("traffic");
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
    <div className="card border-dashed p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-semibold text-slate-900">
          <Sparkles size={16} className="text-brand-600" /> Demo Mode
        </h2>
        <span className="badge bg-slate-100 capitalize text-slate-600">{status}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Simulates a van along a route — writes real pings, so the map &amp; alerts
        above react exactly like a live driver. Gulshan scenarios drive the real
        detection engine (arriving-soon, route deviation).
      </p>

      {targets.length > 1 && (
        <>
          <label className="label">Simulate for</label>
          <select
            className="input mb-3"
            value={selectedId}
            onChange={(e) => {
              stopTimer();
              setStatus("idle");
              idxRef.current = 0;
              setProgress(0);
              setSelectedId(e.target.value);
            }}
            disabled={status === "running" || status === "paused"}
          >
            {targets.map((t) => (
              <option key={t.childId} value={t.childId}>
                {t.childName} — {t.driverName}&apos;s van
              </option>
            ))}
          </select>
        </>
      )}

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
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>{status === "done" ? "Arrived" : `Step ${progress}/${steps.length - 1}`}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Speed:</span>
        {(["normal", "fast"] as const).map((s) => (
          <button
            key={s}
            onClick={() => changeSpeed(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              speed === s
                ? "bg-brand-700 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "normal" ? "Normal (~36 km/h)" : "Fast"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "idle" || status === "done" ? (
          <button onClick={start} className="btn-primary">
            <Play size={15} /> Start Simulation — سمولیشن شروع کریں
          </button>
        ) : status === "running" ? (
          <button onClick={pause} className="btn-ghost"><Pause size={15} /> Pause</button>
        ) : (
          <button onClick={resume} className="btn-primary">
            <Play size={15} /> Resume
          </button>
        )}
        {status !== "idle" && (
          <button onClick={reset} className="btn-ghost"><Reset size={15} /> Reset</button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
