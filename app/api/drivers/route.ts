import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Driver, DriverWithProfile, Profile } from "@/lib/types";

/**
 * GET /api/drivers -> drivers in the signed-in user's city, joined with their
 * profile. City filtering happens here so parents never see other cities.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = user
    ? await supabase.from("profiles").select("city").eq("id", user.id).single()
    : { data: null };
  const city = (me as { city: string } | null)?.city ?? "";

  const { data: drivers } = await supabase.from("drivers").select("*");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,name,whatsapp,city")
    .eq("role", "driver");

  const map = new Map(
    (profiles as Pick<Profile, "id" | "name" | "whatsapp" | "city">[] | null)?.map((p) => [
      p.id,
      p,
    ]) ?? []
  );

  const result: DriverWithProfile[] = ((drivers as Driver[] | null) ?? [])
    .map((d) => {
      const p = map.get(d.id);
      return {
        ...d,
        profile: {
          name: p?.name ?? "Driver",
          whatsapp: p?.whatsapp ?? "",
          city: p?.city ?? "",
        },
      };
    })
    .filter((d) => !city || d.profile.city === city);

  return NextResponse.json({ drivers: result, city });
}
