import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/schools?city=Lahore -> { byArea: { [area]: string[] } }
 * Reads scraped schools from the DB. Returns empty if the table doesn't exist
 * yet (before the migration/scraper run) so the UI falls back to the static
 * catalog in lib/schools.ts.
 */
export async function GET(req: Request) {
  const city = new URL(req.url).searchParams.get("city");
  if (!city) return NextResponse.json({ byArea: {} });

  const supabase = createClient();

  // PostgREST caps responses at 1000 rows, and some cities have more schools
  // than that — page through until we've fetched them all.
  const PAGE = 1000;
  const rows: { area: string; name: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("schools")
      .select("area,name")
      .eq("city", city)
      .order("name")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ byArea: {} });
    const batch = (data as { area: string; name: string }[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const byArea: Record<string, string[]> = {};
  for (const r of rows) {
    (byArea[r.area] ??= []).push(r.name);
  }
  return NextResponse.json({ byArea });
}
