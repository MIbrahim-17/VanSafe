/**
 * DEMO MODE endpoint — self-contained, safe to delete after the hackathon.
 *
 * Writes REAL location pings + alerts for the parent's linked driver using the
 * admin client (a parent's own session can't write the driver's rows under RLS).
 * The parent dashboard then reacts through the normal production read path — no
 * special display code. Every call verifies the caller is the linked parent, so
 * this can't be used to spoof arbitrary drivers.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { alertBody, sendWhatsApp } from "@/lib/whatsapp";
import { explainAnomaly } from "@/lib/gemini";
import type { Child } from "@/lib/types";

async function authLinkedParent(driverId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: child } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", user.id)
    .eq("driver_id", driverId)
    .limit(1)
    .maybeSingle();
  if (!child) return null;
  return { userId: user.id, child: child as Child };
}

export async function POST(req: Request) {
  const { action, driverId, lat, lng } = await req.json();
  if (!driverId || !action) {
    return NextResponse.json({ error: "driverId and action required" }, { status: 400 });
  }

  const ctx = await authLinkedParent(driverId);
  if (!ctx) {
    return NextResponse.json(
      { error: "Only the parent linked to this driver can run a demo." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  switch (action) {
    case "reset": {
      await admin.from("locations").delete().eq("driver_id", driverId);
      await admin
        .from("alerts")
        .delete()
        .eq("driver_id", driverId)
        .eq("parent_id", ctx.userId);
      await admin.from("tracking_sessions").upsert({
        driver_id: driverId,
        active: false,
        status: "idle",
        started_at: null,
        pings_today: 0,
        last_ping_date: today,
      });
      return NextResponse.json({ ok: true });
    }

    case "depart": {
      await admin.from("tracking_sessions").upsert({
        driver_id: driverId,
        active: true,
        status: "moving",
        started_at: nowIso,
        pings_today: 0,
        last_ping_date: today,
      });
      if (typeof lat === "number" && typeof lng === "number") {
        await admin.from("locations").insert({ driver_id: driverId, lat, lng });
      }
      await emitAlert(admin, ctx, driverId, "departed");
      return NextResponse.json({ ok: true });
    }

    case "ping": {
      if (typeof lat !== "number" || typeof lng !== "number") {
        return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
      }
      await admin.from("locations").insert({ driver_id: driverId, lat, lng });
      const { data: s } = await admin
        .from("tracking_sessions")
        .select("pings_today,last_ping_date")
        .eq("driver_id", driverId)
        .maybeSingle();
      const pings =
        s && (s as { last_ping_date: string }).last_ping_date === today
          ? (s as { pings_today: number }).pings_today + 1
          : 1;
      await admin
        .from("tracking_sessions")
        .update({ status: "moving", pings_today: pings, last_ping_date: today })
        .eq("driver_id", driverId);
      return NextResponse.json({ ok: true });
    }

    case "stopped": {
      await admin
        .from("tracking_sessions")
        .update({ status: "stopped" })
        .eq("driver_id", driverId);
      const message = await explainAnomaly(
        "stationary",
        "stopped unexpectedly on the route",
        "en"
      );
      await admin.from("alerts").insert({
        parent_id: ctx.userId,
        driver_id: driverId,
        type: "stationary",
        message,
      });
      await notifyParent(admin, ctx.userId, `⚠️ VanSafe alert: ${message}`);
      return NextResponse.json({ ok: true });
    }

    case "arrive": {
      if (typeof lat === "number" && typeof lng === "number") {
        await admin.from("locations").insert({ driver_id: driverId, lat, lng });
      }
      await admin
        .from("tracking_sessions")
        .update({ active: false, status: "idle" })
        .eq("driver_id", driverId);
      await emitAlert(admin, ctx, driverId, "arrived");
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}

async function emitAlert(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { userId: string; child: Child },
  driverId: string,
  type: "departed" | "arrived"
) {
  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", driverId)
    .single();
  const driverName = (driverProfile as { name: string } | null)?.name ?? "Your driver";
  const message = alertBody(type, driverName, ctx.child.name);
  await admin.from("alerts").insert({
    parent_id: ctx.userId,
    driver_id: driverId,
    type,
    message,
  });
  await notifyParent(admin, ctx.userId, `🚐 VanSafe: ${message}`);
}

async function notifyParent(
  admin: ReturnType<typeof createAdminClient>,
  parentId: string,
  body: string
) {
  const { data: parent } = await admin
    .from("profiles")
    .select("whatsapp")
    .eq("id", parentId)
    .single();
  const wa = (parent as { whatsapp: string } | null)?.whatsapp;
  if (wa) await sendWhatsApp(wa, body);
}
