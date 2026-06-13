import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rankDrivers } from "@/lib/gemini";
import type { Driver, DriverWithProfile, Profile } from "@/lib/types";

/** POST /api/match  body {school,area,children} -> ranked drivers with reasons. */
export async function POST(req: Request) {
  const { school = "", area = "", children = 1 } = await req.json();
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

  const profileMap = new Map(
    (profiles as Pick<Profile, "id" | "name" | "whatsapp" | "city">[] | null)?.map((p) => [
      p.id,
      p,
    ]) ?? []
  );

  // City filter is applied BEFORE the AI sees the candidates.
  const withProfiles: DriverWithProfile[] = ((drivers as Driver[] | null) ?? [])
    .map((d) => {
      const p = profileMap.get(d.id);
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

  const results = await rankDrivers({ school, area, children: Number(children) || 1 }, withProfiles);

  const byId = new Map(withProfiles.map((d) => [d.id, d]));
  const ranked = results
    .map((m) => ({ match: m, driver: byId.get(m.driverId) }))
    .filter((r) => r.driver);

  return NextResponse.json({ ranked, city });
}
