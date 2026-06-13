import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { AttendanceStatus, Child, Profile } from "@/lib/types";

/**
 * POST /api/attendance  body { childId, status, date? }
 * Marks a child present/absent for a day. Either the child's parent or their
 * linked driver may call it. When a parent marks absent, the driver is notified
 * on WhatsApp so they can skip that pickup before leaving.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { childId, status, date } = (await req.json()) as {
    childId: string;
    status: AttendanceStatus;
    date?: string;
  };
  if (status !== "present" && status !== "absent")
    return NextResponse.json({ error: "status must be present|absent" }, { status: 400 });

  const admin = createAdminClient();
  const { data: childRow } = await admin
    .from("children")
    .select("*")
    .eq("id", childId)
    .maybeSingle();
  const child = childRow as Child | null;
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  const isParent = child.parent_id === user.id;
  const isDriver = child.driver_id === user.id;
  if (!isParent && !isDriver)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const day = date ?? new Date().toISOString().slice(0, 10);
  const { error } = await admin.from("attendance").upsert(
    {
      child_id: child.id,
      driver_id: child.driver_id,
      parent_id: child.parent_id,
      date: day,
      status,
      marked_by: isParent ? "parent" : "driver",
    },
    { onConflict: "child_id,date" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Parent-initiated absence → tell the driver before they leave.
  if (isParent && status === "absent" && child.driver_id) {
    const { data: driver } = await admin
      .from("profiles")
      .select("whatsapp")
      .eq("id", child.driver_id)
      .single();
    const wa = (driver as Pick<Profile, "whatsapp"> | null)?.whatsapp;
    if (wa)
      await sendWhatsApp(
        wa,
        `VanSafe: ${child.name} is marked ABSENT today — you can skip this pickup. آج ${child.name} غیر حاضر ہے۔`
      );
  }

  return NextResponse.json({ ok: true });
}
