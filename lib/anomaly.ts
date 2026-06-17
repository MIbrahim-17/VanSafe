import { createAdminClient } from "@/lib/supabase/admin";
import { explainAnomaly } from "@/lib/gemini";
import { sendWhatsApp } from "@/lib/whatsapp";
import { estimateEta, type LatLng } from "@/lib/eta";
import { distanceMeters, minutesAgo } from "@/lib/utils";
import type {
  AlertType,
  BaseRoute,
  Child,
  LocationPing,
  Profile,
  RoutePeriod,
} from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

const STATIONARY_MIN = 15; // minutes stopped before alerting
const STATIONARY_RADIUS_M = 60; // "same spot" tolerance
const DEVIATION_CORRIDOR_M = 1200; // metres off the usual path that looks unusual
const DEDUPE_MIN = 20; // don't repeat the same alert within this window
const ARRIVE_SOON_M = 700; // within this of a pickup -> "arriving soon"
const ARRIVE_SOON_SPEED_KMH = 18; // rough city speed for the minutes estimate
const ARRIVE_DEDUPE_MIN = 30;
const TRAFFIC_DELAY_MIN = 7; // predicted minutes late before alerting
const TRAFFIC_DEDUPE_MIN = 30;

/**
 * Run anomaly checks for a driver after a fresh ping. Detects:
 *  - 15+ minutes stationary in one spot
 *  - a large deviation from the driver's usual route (past-days GPS history)
 *  - the van approaching a child's pickup point ("arriving soon")
 * Each detection is written to `alerts` (per linked parent) and pushed via
 * WhatsApp. Returns the alert types fired.
 *
 * `opts` lets callers (e.g. Demo Mode) run only a subset of checks; all default
 * to on for the real per-ping path.
 */
export async function runAnomalyChecks(
  driverId: string,
  opts: { stationary?: boolean; deviation?: boolean; arrivingSoon?: boolean } = {}
): Promise<AlertType[]> {
  const { stationary = true, deviation = true, arrivingSoon = true } = opts;
  const admin = createAdminClient();
  const fired: AlertType[] = [];

  const { data: recentRaw } = await admin
    .from("locations")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    // Wide enough that a day of today's pings never pushes the multi-day
    // history (the deviation baseline) out of range.
    .limit(150);
  const recent = (recentRaw as LocationPing[] | null) ?? [];
  if (recent.length < 2) return fired;

  const latest = recent[0];

  // --- Stationary detection ---
  const withinWindow = stationary
    ? recent.filter((p) => minutesAgo(p.created_at) <= STATIONARY_MIN + 1)
    : [];
  if (withinWindow.length >= 3) {
    const oldest = withinWindow[withinWindow.length - 1];
    const spanMin = minutesAgo(oldest.created_at) - minutesAgo(latest.created_at);
    const allClose = withinWindow.every(
      (p) => distanceMeters(latest.lat, latest.lng, p.lat, p.lng) <= STATIONARY_RADIUS_M
    );
    if (allClose && spanMin >= STATIONARY_MIN) {
      const minutes = minutesAgo(oldest.created_at);
      const msg = await explainAnomaly("stationary", `${minutes} minutes in one place`, "en");
      if (await notifyAllParents(admin, driverId, "stationary", msg)) fired.push("stationary");
    }
  }

  // --- Route deviation (vs the usual path built from past-days history) ---
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const historic = deviation
    ? recent.filter((p) => new Date(p.created_at) < startOfToday)
    : [];
  if (historic.length >= 8) {
    // Distance to the *nearest* historic point = how far off the usual corridor.
    const offCorridor = (p: LocationPing) =>
      Math.min(...historic.map((h) => distanceMeters(p.lat, p.lng, h.lat, h.lng)));
    const todays = recent
      .filter((p) => new Date(p.created_at) >= startOfToday)
      .slice(0, 3);
    // Only alert when it's persistent (not one stray GPS fix).
    const persistent =
      todays.length >= 2 && todays.every((t) => offCorridor(t) > DEVIATION_CORRIDOR_M);
    if (offCorridor(latest) > DEVIATION_CORRIDOR_M && persistent) {
      const km = (offCorridor(latest) / 1000).toFixed(1);
      const msg = await explainAnomaly("route_deviation", `${km} km off the usual route`, "en");
      if (await notifyAllParents(admin, driverId, "route_deviation", msg))
        fired.push("route_deviation");
    }
  }

  // --- Arriving soon: van approaching a child's pickup point ---
  const { data: kidsRaw } = arrivingSoon
    ? await admin.from("children").select("*").eq("driver_id", driverId)
    : { data: [] };
  for (const kid of (kidsRaw as Child[] | null) ?? []) {
    if (kid.pickup_lat == null || kid.pickup_lng == null) continue;
    const d = distanceMeters(latest.lat, latest.lng, kid.pickup_lat, kid.pickup_lng);
    // Close, but not basically on top of it (that's effectively "arrived").
    if (d <= ARRIVE_SOON_M && d > STATIONARY_RADIUS_M) {
      const mins = Math.max(1, Math.round((d / 1000 / ARRIVE_SOON_SPEED_KMH) * 60));
      const msg =
        `🚌 The van is about ${mins} min from ${kid.name} — please be ready.\n` +
        `وین تقریباً ${mins} منٹ میں ${kid.name} تک پہنچنے والی ہے۔`;
      if (await notifyParent(admin, kid.parent_id, driverId, "arriving_soon", msg, ARRIVE_DEDUPE_MIN))
        fired.push("arriving_soon");
    }
  }

  return fired;
}

/**
 * Predict whether today's traffic will make the driver late, and alert parents
 * if so. Called at route start (full-route prediction) and re-checked mid-route
 * from the van's current position (pass `opts.origin`). Compares the
 * live-traffic ETA against the typical duration to the destination.
 */
export async function predictTrafficDelay(
  driverId: string,
  period: RoutePeriod,
  opts: { origin?: LatLng } = {}
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: routeRow } = await admin
    .from("routes")
    .select("*")
    .eq("driver_id", driverId)
    .maybeSingle();
  const base = routeRow as BaseRoute | null;
  if (
    !base ||
    base.home_lat == null ||
    base.home_lng == null ||
    base.school_lat == null ||
    base.school_lng == null
  )
    return false;

  const home = { lat: base.home_lat, lng: base.home_lng };
  const school = { lat: base.school_lat, lng: base.school_lng };
  // Mid-route: start from where the van actually is now. At route start: the
  // route's origin for this period.
  const origin = opts.origin ?? (period === "morning" ? home : school);
  const dest = period === "morning" ? school : home;

  const eta = await estimateEta(origin, dest, { traffic: true });
  if (eta.delayS < TRAFFIC_DELAY_MIN * 60) return false; // not enough delay to bother parents

  const lateMin = Math.round(eta.delayS / 60);
  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", driverId)
    .single();
  const driverName = (driverProfile as { name: string } | null)?.name ?? "Your driver";
  const destLabel = period === "morning" ? base.school_name || "school" : "home";

  const message =
    `🚦 Heavy traffic on the usual route today. ${driverName} may be about ${lateMin} min late to ${destLabel}.\n` +
    `آج راستے میں ٹریفک زیادہ ہے، وین تقریباً ${lateMin} منٹ لیٹ ہو سکتی ہے۔`;
  return notifyAllParents(admin, driverId, "traffic_delay", message, TRAFFIC_DEDUPE_MIN);
}

// ---------------------------------------------------------------------------
// Delivery helpers
// ---------------------------------------------------------------------------

/** Notify a single parent (deduped by alert type) and push to WhatsApp. */
async function notifyParent(
  admin: Admin,
  parentId: string,
  driverId: string,
  type: AlertType,
  message: string,
  dedupeMin = DEDUPE_MIN
): Promise<boolean> {
  const since = new Date(Date.now() - dedupeMin * 60000).toISOString();
  const { data: existing } = await admin
    .from("alerts")
    .select("id")
    .eq("parent_id", parentId)
    .eq("driver_id", driverId)
    .eq("type", type)
    .gte("created_at", since)
    .maybeSingle();
  if (existing) return false;

  await admin.from("alerts").insert({ parent_id: parentId, driver_id: driverId, type, message });

  const { data: parent } = await admin
    .from("profiles")
    .select("whatsapp")
    .eq("id", parentId)
    .single();
  const wa = (parent as Pick<Profile, "whatsapp"> | null)?.whatsapp;
  if (wa) await sendWhatsApp(wa, `VanSafe: ${message}`);
  return true;
}

/** Notify every parent linked to this driver (one alert each, deduped). */
async function notifyAllParents(
  admin: Admin,
  driverId: string,
  type: AlertType,
  message: string,
  dedupeMin = DEDUPE_MIN
): Promise<boolean> {
  const { data: kids } = await admin
    .from("children")
    .select("parent_id")
    .eq("driver_id", driverId);
  const parentIds = Array.from(
    new Set(((kids as { parent_id: string }[] | null) ?? []).map((c) => c.parent_id))
  );
  if (!parentIds.length) return false;

  let any = false;
  for (const parentId of parentIds) {
    if (await notifyParent(admin, parentId, driverId, type, message, dedupeMin)) any = true;
  }
  return any;
}
