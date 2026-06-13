import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/reviews  body {driverId,rating,comment} -> create a review. */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { driverId, rating, comment = "" } = await req.json();
  if (!driverId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Valid driverId and rating (1-5) required" }, { status: 400 });
  }

  // Must be linked to this driver to review.
  const { data: link } = await supabase
    .from("links")
    .select("id")
    .eq("parent_id", user.id)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json(
      { error: "You can only review a van you are linked to." },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("reviews").insert({
    driver_id: driverId,
    parent_id: user.id,
    rating,
    comment,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
