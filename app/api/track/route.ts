import { createAdminClient } from "@/lib/supabase/admin";
import { runAnomalyChecks, predictTrafficDelay } from "@/lib/anomaly";
import { sendWhatsApp } from "@/lib/whatsapp";
import { distanceMeters } from "@/lib/utils";
import type { BaseRoute, Child, Driver, RoutePeriod, TrackingSession } from "@/lib/types";

/**
 * GET/POST /api/track — OsmAnd-protocol ingest for the Traccar Client app, so a
 * driver can share live location in the background without logging into the web
 * app. The Traccar Client "device identifier" is the driver's secret
 * `track_token`; it's the only credential this open endpoint authenticates on.
 *
 * Each ping: insert into `locations`, drive the same pipeline as the web tracker
 * (anomaly checks, traffic-delay), and fire departed/arrived alerts per leg.
 * Leg direction is inferred from local time (before noon PKT = to school, else to
 * home); "departed" fires on the first ping of a leg, "arrived" within ~200 m of
 * the destination. Recipients are the children present today.
 */

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

const ARRIVE_RADIUS_M = 200;
const TRAFFIC_RECHECK_EVERY = 20; // ~every 10 min at a 30s ping cadence
const PKT_OFFSET_H = 5; // Pakistan is UTC+5, no DST

/** Morning (to school) before noon Pakistan time, afternoon (to home) after. */
function inferPeriod(): RoutePeriod {
  const pktHour = (new Date().getUTCHours() + PKT_OFFSET_H) % 24;
  return pktHour < 12 ? "morning" : "afternoon";
}

/** Parse the OsmAnd `timestamp` (unix seconds) into an ISO string, if valid. */
function parseTimestamp(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/**
 * Read OsmAnd params from the query string AND (for POST) the body, since
 * Traccar Client can put them in either depending on version/config.
 */
async function readParams(req: Request): Promise<URLSearchParams> {
  const params = new URLSearchParams(new URL(req.url).searchParams);
  if (req.method !== "POST") return params;
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("form-data") || ct.includes("x-www-form-urlencoded")) {
      const form = await req.formData();
      form.forEach((v, k) => {
        if (!params.has(k)) params.set(k, String(v));
      });
    } else {
      const text = await req.text();
      if (text) {
        new URLSearchParams(text).forEach((v, k) => {
          if (!params.has(k)) params.set(k, v);
        });
      }
    }
  } catch {
    /* no/unsupported body */
  }
  return params;
}

async function handle(req: Request): Promise<Response> {
  const q = await readParams(req);
  const token = q.get("id");
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lon"));
  console.log(`[track] ${req.method} id=${token ?? "-"} lat=${q.get("lat") ?? "-"} lon=${q.get("lon") ?? "-"}`);
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response("id, lat, lon required", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: driverRow } = await admin
    .from("drivers")
    .select("id")
    .eq("track_token", token)
    .maybeSingle();
  const driver = driverRow as Pick<Driver, "id"> | null;
  if (!driver) {
    console.warn(`[track] unknown device token: ${token}`);
    return new Response("Unknown device", { status: 401 });
  }
  const driverId = driver.id;

  const createdAt = parseTimestamp(q.get("timestamp"));
  const { error: insErr } = await admin.from("locations").insert({
    driver_id: driverId,
    lat,
    lng,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (insErr) console.error(`[track] insert failed:`, insErr.message);
  else console.log(`[track] stored ping for driver ${driverId} @ ${lat},${lng}`);

  const today = new Date().toISOString().slice(0, 10);
  const period = inferPeriod();
  const { data: sessRow } = await admin
    .from("tracking_sessions")
    .select("*")
    .eq("driver_id", driverId)
    .maybeSingle();
  const sess = sessRow as TrackingSession | null;

  // A new "leg" = first ping of the day, or the morning->afternoon flip. Keyed on
  // date+period only (not `active`), so marking a leg arrived/ended doesn't make
  // the next ping look like a fresh departure.
  const isNewLeg = !sess || sess.last_ping_date !== today || sess.period !== period;

  let status = "moving";
  let pingsToday = 1;

  if (isNewLeg) {
    await admin.from("tracking_sessions").upsert({
      driver_id: driverId,
      active: true,
      status: "moving",
      started_at: new Date().toISOString(),
      pings_today: 1,
      last_ping_date: today,
      period,
    });
    const present = await presentChildren(admin, driverId, today);
    await emitLeg(admin, driverId, "departed", period, present);
    try {
      await predictTrafficDelay(driverId, period, { origin: { lat, lng } });
    } catch (err) {
      console.error("traffic-delay prediction failed:", err);
    }
  } else {
    pingsToday = (sess.pings_today ?? 0) + 1;
    status = (sess.status as string) === "arrived" ? "arrived" : "moving";
    await admin
      .from("tracking_sessions")
      .update({ status, pings_today: pingsToday, last_ping_date: today })
      .eq("driver_id", driverId);
  }

  await runAnomalyChecks(driverId);

  // Arrival: within ARRIVE_RADIUS_M of the leg's destination, once per leg.
  if (status !== "arrived") {
    const { data: routeRow } = await admin
      .from("routes")
      .select("*")
      .eq("driver_id", driverId)
      .maybeSingle();
    const base = routeRow as BaseRoute | null;
    const dest =
      period === "morning"
        ? base && base.school_lat != null && base.school_lng != null
          ? { lat: base.school_lat, lng: base.school_lng }
          : null
        : base && base.home_lat != null && base.home_lng != null
        ? { lat: base.home_lat, lng: base.home_lng }
        : null;
    if (dest && distanceMeters(lat, lng, dest.lat, dest.lng) <= ARRIVE_RADIUS_M) {
      await admin
        .from("tracking_sessions")
        .update({ status: "arrived", active: false })
        .eq("driver_id", driverId);
      const present = await presentChildren(admin, driverId, today);
      await emitLeg(admin, driverId, "arrived", period, present);
    }
  }

  // Throttled mid-route traffic re-check from the current position.
  if (!isNewLeg && pingsToday % TRAFFIC_RECHECK_EVERY === 0) {
    try {
      await predictTrafficDelay(driverId, period, { origin: { lat, lng } });
    } catch (err) {
      console.error("mid-route traffic re-check failed:", err);
    }
  }

  return new Response("OK", { status: 200 });
}

export const GET = handle;
export const POST = handle;

/** Linked children not marked absent today. */
async function presentChildren(admin: Admin, driverId: string, today: string): Promise<Child[]> {
  const { data: kidsRaw } = await admin.from("children").select("*").eq("driver_id", driverId);
  const children = (kidsRaw as Child[] | null) ?? [];
  if (!children.length) return [];
  const { data: absentRaw } = await admin
    .from("attendance")
    .select("child_id")
    .eq("date", today)
    .eq("status", "absent")
    .in("child_id", children.map((c) => c.id));
  const absent = new Set(((absentRaw as { child_id: string }[] | null) ?? []).map((a) => a.child_id));
  return children.filter((c) => !absent.has(c.id));
}

/** Insert + WhatsApp a departed/arrived alert for each present child. */
async function emitLeg(
  admin: Admin,
  driverId: string,
  kind: "departed" | "arrived",
  period: RoutePeriod,
  present: Child[]
): Promise<void> {
  if (!present.length) return;
  const { data: prof } = await admin.from("profiles").select("name").eq("id", driverId).single();
  const driverName = (prof as { name: string } | null)?.name ?? "Your driver";

  for (const child of present) {
    let message: string;
    let type: string;
    if (kind === "departed") {
      message =
        period === "morning"
          ? `🚐 ${driverName}'s van has departed. ${child.name} is on the way to school.`
          : `🏫 ${driverName}'s van has started the drop-off. ${child.name} is on the way home.`;
      type = period === "morning" ? "departed" : "info";
    } else {
      message =
        period === "morning"
          ? `🏫 ${driverName}'s van has arrived. ${child.name} has reached school safely.`
          : `🏠 ${driverName}'s van has arrived. ${child.name} has reached home safely.`;
      type = "arrived";
    }
    await admin.from("alerts").insert({
      parent_id: child.parent_id,
      driver_id: driverId,
      type,
      message,
    });
    const { data: parent } = await admin
      .from("profiles")
      .select("whatsapp")
      .eq("id", child.parent_id)
      .single();
    const wa = (parent as { whatsapp: string } | null)?.whatsapp;
    if (wa) await sendWhatsApp(wa, `VanSafe: ${message}`);
  }
}
