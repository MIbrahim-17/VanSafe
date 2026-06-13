import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/route — save the driver's base route (home, school, child order,
 * fuel average). Upserts the single `routes` row owned by the driver.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const childOrder: string[] = Array.isArray(body.child_order) ? body.child_order : [];

  const { error } = await supabase.from("routes").upsert({
    driver_id: user.id,
    home_address: body.home_address ?? "",
    home_lat: body.home_lat ?? null,
    home_lng: body.home_lng ?? null,
    school_name: body.school_name ?? "",
    school_lat: body.school_lat ?? null,
    school_lng: body.school_lng ?? null,
    child_order: childOrder,
    fuel_avg_kmpl: Number(body.fuel_avg_kmpl) || 10,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
