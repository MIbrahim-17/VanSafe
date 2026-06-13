import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { alertBody, sendWhatsApp } from "@/lib/whatsapp";
import type { Child, Profile } from "@/lib/types";

/**
 * POST /api/tracking  body {action:'start'|'stop'}
 * Toggles the driver's tracking session and sends proactive departed/arrived
 * alerts to every linked parent.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json();
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action must be start|stop" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Upsert the session.
  if (action === "start") {
    await supabase.from("tracking_sessions").upsert({
      driver_id: user.id,
      active: true,
      status: "moving",
      started_at: new Date().toISOString(),
      pings_today: 0,
      last_ping_date: today,
    });
  } else {
    await supabase
      .from("tracking_sessions")
      .update({ active: false, status: "idle" })
      .eq("driver_id", user.id);
  }

  // Notify linked parents (admin client crosses RLS boundaries safely).
  const admin = createAdminClient();
  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const driverName = (driverProfile as { name: string } | null)?.name ?? "Your driver";

  const { data: kids } = await admin.from("children").select("*").eq("driver_id", user.id);
  for (const child of (kids as Child[] | null) ?? []) {
    const type = action === "start" ? "departed" : "arrived";
    const message = alertBody(type, driverName, child.name);
    await admin.from("alerts").insert({
      parent_id: child.parent_id,
      driver_id: user.id,
      type,
      message,
    });
    const { data: parent } = await admin
      .from("profiles")
      .select("whatsapp")
      .eq("id", child.parent_id)
      .single();
    const wa = (parent as Pick<Profile, "whatsapp"> | null)?.whatsapp;
    if (wa) await sendWhatsApp(wa, `🚐 VanSafe: ${message}`);
  }

  return NextResponse.json({ ok: true });
}
