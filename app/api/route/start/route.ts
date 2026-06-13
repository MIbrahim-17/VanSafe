import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { Child, Profile, RoutePeriod } from "@/lib/types";

/**
 * POST /api/route/start  body { period, presentChildIds }
 * Starts GPS tracking for the day and notifies the parents of present children
 * that the van has departed (morning) or started drop-off (afternoon).
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
  const today = new Date().toISOString().slice(0, 10);

  await supabase.from("tracking_sessions").upsert({
    driver_id: user.id,
    active: true,
    status: "moving",
    started_at: new Date().toISOString(),
    pings_today: 0,
    last_ping_date: today,
  });

  const admin = createAdminClient();
  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const driverName = (driverProfile as { name: string } | null)?.name ?? "Your driver";

  const ids = Array.isArray(presentChildIds) ? presentChildIds : [];
  if (ids.length) {
    const { data: kids } = await admin
      .from("children")
      .select("*")
      .eq("driver_id", user.id)
      .in("id", ids);

    for (const child of (kids as Child[] | null) ?? []) {
      const message =
        period === "morning"
          ? `🚐 ${driverName}'s van has departed. ${child.name} is on the way to school.`
          : `🏫 ${driverName}'s van has started the drop-off. ${child.name} is on the way home.`;
      await admin.from("alerts").insert({
        parent_id: child.parent_id,
        driver_id: user.id,
        type: period === "morning" ? "departed" : "info",
        message,
      });
      const { data: parent } = await admin
        .from("profiles")
        .select("whatsapp")
        .eq("id", child.parent_id)
        .single();
      const wa = (parent as Pick<Profile, "whatsapp"> | null)?.whatsapp;
      if (wa) await sendWhatsApp(wa, `VanSafe: ${message}`);
    }
  }

  return NextResponse.json({ ok: true });
}
