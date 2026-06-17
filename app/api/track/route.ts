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

interface Ping {
  id: string | null;
  lat: number;
  lng: number;
  timestamp: string | null;
  debug: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pull id/lat/lon/timestamp out of a parsed JSON body (Traccar Client iOS posts
 *  JSON: flat OsmAnd, the transistorsoft {location:{coords}} shape, or a batch
 *  array). Returns partials; query-string values take precedence. */
function fromJson(j: any): { id: any; lat: any; lon: any; ts: any } {
  const id = j?.id ?? j?.device_id ?? j?.deviceId ?? j?.uniqueId ?? null;
  let loc = j?.location ?? j;
  if (Array.isArray(loc)) loc = loc[loc.length - 1] ?? {};
  const c = loc?.coords ?? loc ?? {};
  return {
    id,
    lat: c?.lat ?? c?.latitude ?? null,
    lon: c?.lon ?? c?.lng ?? c?.longitude ?? null,
    ts: loc?.timestamp ?? j?.timestamp ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Read a ping from the query string and/or POST body (JSON or form-encoded). */
async function readPing(req: Request): Promise<Ping> {
  const qp = new URL(req.url).searchParams;
  let id: unknown = qp.get("id");
  let lat: unknown = qp.get("lat");
  let lon: unknown = qp.get("lon");
  let ts: unknown = qp.get("timestamp");
  let debug = "src=query";

  if (req.method === "POST" && (id == null || lat == null || lon == null)) {
    let raw = "";
    try {
      raw = await req.text();
    } catch {
      /* no body */
    }
    debug = `ct=${req.headers.get("content-type") ?? "-"} body=${raw.slice(0, 200)}`;
    if (raw) {
      try {
        const j = fromJson(JSON.parse(raw));
        id = id ?? j.id;
        lat = lat ?? j.lat;
        lon = lon ?? j.lon;
        ts = ts ?? j.ts;
      } catch {
        const bp = new URLSearchParams(raw);
        id = id ?? bp.get("id");
        lat = lat ?? bp.get("lat");
        lon = lon ?? bp.get("lon");
        ts = ts ?? bp.get("timestamp");
      }
    }
  }
  return {
    id: id != null ? String(id) : null,
    lat: Number(lat),
    lng: Number(lon),
    timestamp: ts != null ? String(ts) : null,
    debug,
  };
}

async function handle(req: Request): Promise<Response> {
  const ping = await readPing(req);
  const token = ping.id;
  const lat = ping.lat;
  const lng = ping.lng;
  console.log(
    `[track] ${req.method} id=${token ?? "-"} lat=${Number.isFinite(lat) ? lat : "-"} lon=${
      Number.isFinite(lng) ? lng : "-"
    } | ${ping.debug}`
  );
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

  const createdAt = parseTimestamp(ping.timestamp);
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
