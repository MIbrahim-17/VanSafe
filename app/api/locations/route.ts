import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAnomalyChecks, predictTrafficDelay } from "@/lib/anomaly";
import { distanceMeters } from "@/lib/utils";
import type { LocationPing, TrackingSession } from "@/lib/types";

// Re-check traffic roughly every Nth ping (~30s cadence => ~every 10 min).
const TRAFFIC_RECHECK_EVERY = 20;

/** GET /api/locations?driverId=... -> latest ping + last 10 (RLS enforced). */
export async function GET(req: Request) {
  const driverId = new URL(req.url).searchParams.get("driverId");
  if (!driverId) return NextResponse.json({ error: "driverId required" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const history = (data as LocationPing[]) ?? [];
  return NextResponse.json({ latest: history[0] ?? null, history });
}

/** POST /api/locations  body {lat,lng} -> record a ping for the signed-in driver. */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const { error: insErr } = await supabase
    .from("locations")
    .insert({ driver_id: user.id, lat, lng });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // Determine movement vs the previous ping for the live status.
  const { data: prev } = await supabase
    .from("locations")
    .select("*")
    .eq("driver_id", user.id)
    .order("created_at", { ascending: false })
    .range(1, 1);
  const previous = (prev as LocationPing[] | null)?.[0];
  const status =
    previous && distanceMeters(lat, lng, previous.lat, previous.lng) > 40
      ? "moving"
      : "stopped";

  // Update/maintain today's ping counter.
  const today = new Date().toISOString().slice(0, 10);
  const { data: session } = await supabase
    .from("tracking_sessions")
    .select("*")
    .eq("driver_id", user.id)
    .maybeSingle();
  const pingsToday =
    session && session.last_ping_date === today ? session.pings_today + 1 : 1;

  await supabase
    .from("tracking_sessions")
    .update({ status, pings_today: pingsToday, last_ping_date: today })
    .eq("driver_id", user.id);

  // Fire-and-await anomaly checks (stationary / route deviation / arriving soon).
  await runAnomalyChecks(user.id);

  // Mid-route traffic re-check from the van's current position, throttled so we
  // don't hit the routing API on every ping. Uses the period saved at start.
  const sess = session as TrackingSession | null;
  if (
    sess?.active &&
    (sess.period === "morning" || sess.period === "afternoon") &&
    pingsToday > 0 &&
    pingsToday % TRAFFIC_RECHECK_EVERY === 0
  ) {
    try {
      await predictTrafficDelay(user.id, sess.period, { origin: { lat, lng } });
    } catch (err) {
      console.error("mid-route traffic re-check failed:", err);
    }
  }

  return NextResponse.json({ ok: true, status, pingsToday });
}
