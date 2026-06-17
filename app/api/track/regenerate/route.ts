import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/track/regenerate — issue a fresh Traccar token for the signed-in
 * driver (invalidates the old one). Runs via the admin client after verifying
 * the caller is that driver.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = crypto.randomBytes(6).toString("hex"); // 12 hex chars
  const admin = createAdminClient();
  const { error } = await admin
    .from("drivers")
    .update({ track_token: token })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ token });
}
