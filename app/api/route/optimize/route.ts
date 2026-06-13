import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optimizeRoute, type StopInput } from "@/lib/routing";
import { ensureChildCoords, hasCoords } from "@/lib/route-helpers";
import { MAX_ROUTE_STOPS } from "@/lib/constants";
import type { BaseRoute, Child, Profile, RoutePeriod } from "@/lib/types";

/**
 * POST /api/route/optimize  body { period, presentChildIds }
 * Optimizes today's route for the present children and stores the day's metrics.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { period, presentChildIds } = (await req.json()) as {
    period: RoutePeriod;
    presentChildIds: string[];
  };
  if (period !== "morning" && period !== "afternoon")
    return NextResponse.json({ error: "period must be morning|afternoon" }, { status: 400 });

  const admin = createAdminClient();

  // Base route (home + school) is required.
  const { data: routeRow } = await admin
    .from("routes")
    .select("*")
    .eq("driver_id", user.id)
    .maybeSingle();
  const base = routeRow as BaseRoute | null;
  if (!base || base.home_lat == null || base.school_lat == null) {
    return NextResponse.json(
      { error: "Set up your base route (home + destination school) first." },
      { status: 400 }
    );
  }

  const present = Array.isArray(presentChildIds) ? presentChildIds : [];
  if (present.length === 0) {
    return NextResponse.json({ empty: true });
  }

  // Driver's city helps geocode any pickup addresses still missing coordinates.
  const { data: prof } = await admin
    .from("profiles")
    .select("city")
    .eq("id", user.id)
    .single();
  const city = (prof as Pick<Profile, "city"> | null)?.city;

  const { data: kidRows } = await admin
    .from("children")
    .select("*")
    .eq("driver_id", user.id)
    .in("id", present);
  let children = (kidRows as Child[] | null) ?? [];
  children = await ensureChildCoords(admin, children, city);

  const routable = children.filter(hasCoords);
  const skipped = children.filter((c) => !hasCoords(c)).map((c) => c.name);
  if (routable.length === 0) {
    return NextResponse.json({
      empty: true,
      skipped,
      error: "None of the present children have a usable pickup address yet.",
    });
  }

  const stops: StopInput[] = routable.slice(0, MAX_ROUTE_STOPS).map((c) => ({
    childId: c.id,
    name: c.name,
    lat: c.pickup_lat as number,
    lng: c.pickup_lng as number,
  }));

  // Morning: home -> children -> school. Afternoon: school -> children -> home.
  const home = { lat: base.home_lat as number, lng: base.home_lng as number };
  const dest = { lat: base.school_lat as number, lng: base.school_lng as number };
  const result = await optimizeRoute({
    origin: period === "morning" ? home : dest,
    destination: period === "morning" ? dest : home,
    stops,
    period,
    fuelKmpl: Number(base.fuel_avg_kmpl) || 10,
  });

  // Persist today's metrics (one row per driver/day/period).
  const today = new Date().toISOString().slice(0, 10);
  await admin.from("route_logs").upsert(
    {
      driver_id: user.id,
      date: today,
      period,
      stops: result.stops.length,
      optimized_distance_m: result.optimizedDistanceM,
      unoptimized_distance_m: result.unoptimizedDistanceM,
      duration_s: result.durationS,
      fuel_cost: result.fuelCost,
      fuel_saved: result.fuelSaved,
      distance_saved_m: result.distanceSavedM,
      time_saved_s: result.timeSavedS,
      engine: result.engine,
    },
    { onConflict: "driver_id,date,period" }
  );

  return NextResponse.json({ ...result, skipped });
}
