import { createAdminClient } from "@/lib/supabase/admin";
import { explainAnomaly } from "@/lib/gemini";
import { sendWhatsApp } from "@/lib/whatsapp";
import { distanceMeters, minutesAgo } from "@/lib/utils";
import type { AlertType, LinkRow, LocationPing, Profile } from "@/lib/types";

const STATIONARY_MIN = 15; // minutes stopped before alerting
const STATIONARY_RADIUS_M = 60; // "same spot" tolerance
const DEVIATION_M = 4000; // metres from historic centre that looks unusual
const DEDUPE_MIN = 20; // don't repeat the same alert within this window

/**
 * Run anomaly checks for a driver after a fresh ping. Detects:
 *  - 15+ minutes stationary in one spot
 *  - a large deviation from the driver's historic route centre
 * Each detection is written to `alerts` (per linked parent) and pushed via
 * WhatsApp with a plain-language explanation. Returns the alert types fired.
 */
export async function runAnomalyChecks(driverId: string): Promise<AlertType[]> {
  const admin = createAdminClient();
  const fired: AlertType[] = [];

  const { data: recentRaw } = await admin
    .from("locations")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(30);
  const recent = (recentRaw as LocationPing[] | null) ?? [];
  if (recent.length < 2) return fired;

  const latest = recent[0];

  // --- Stationary detection ---
  const withinWindow = recent.filter(
    (p) => minutesAgo(p.created_at) <= STATIONARY_MIN + 1
  );
  if (withinWindow.length >= 3) {
    const oldest = withinWindow[withinWindow.length - 1];
    const spanMin = minutesAgo(oldest.created_at) - minutesAgo(latest.created_at);
    const allClose = withinWindow.every(
      (p) => distanceMeters(latest.lat, latest.lng, p.lat, p.lng) <= STATIONARY_RADIUS_M
    );
    if (allClose && spanMin >= STATIONARY_MIN) {
      const minutes = minutesAgo(oldest.created_at);
      if (await fire(admin, driverId, "stationary", `${minutes} minutes in one place`))
        fired.push("stationary");
    }
  }

  // --- Route deviation detection (vs historic centre, older than today) ---
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const historic = recent.filter(
    (p) => new Date(p.created_at) < startOfToday
  );
  if (historic.length >= 5) {
    const cLat = avg(historic.map((p) => p.lat));
    const cLng = avg(historic.map((p) => p.lng));
    const maxHist = Math.max(
      ...historic.map((p) => distanceMeters(cLat, cLng, p.lat, p.lng))
    );
    const dist = distanceMeters(cLat, cLng, latest.lat, latest.lng);
    if (dist > maxHist + DEVIATION_M) {
      if (
        await fire(
          admin,
          driverId,
          "route_deviation",
          `${Math.round(dist / 1000)} km from the usual route`
        )
      )
        fired.push("route_deviation");
    }
  }

  return fired;
}

/** Insert an alert for every linked parent (deduped) and notify via WhatsApp. */
async function fire(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
  type: "stationary" | "route_deviation",
  details: string
): Promise<boolean> {
  const { data: links } = await admin
    .from("links")
    .select("*")
    .eq("driver_id", driverId);
  const linkRows = (links as LinkRow[] | null) ?? [];
  if (!linkRows.length) return false;

  let any = false;
  for (const link of linkRows) {
    // Dedupe: skip if same alert type fired for this parent recently.
    const since = new Date(Date.now() - DEDUPE_MIN * 60000).toISOString();
    const { data: existing } = await admin
      .from("alerts")
      .select("id")
      .eq("parent_id", link.parent_id)
      .eq("driver_id", driverId)
      .eq("type", type)
      .gte("created_at", since)
      .maybeSingle();
    if (existing) continue;

    const { data: parent } = await admin
      .from("profiles")
      .select("*")
      .eq("id", link.parent_id)
      .single();
    const p = parent as Profile | null;

    const message = await explainAnomaly(type, details, "en");
    await admin.from("alerts").insert({
      parent_id: link.parent_id,
      driver_id: driverId,
      type,
      message,
    });
    if (p?.whatsapp) await sendWhatsApp(p.whatsapp, `⚠️ VanSafe alert: ${message}`);
    any = true;
  }
  return any;
}

function avg(nums: number[]) {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
