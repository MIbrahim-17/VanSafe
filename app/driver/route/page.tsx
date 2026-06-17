import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureChildCoords } from "@/lib/route-helpers";
import { schoolLocation } from "@/lib/schools";
import { cityLabel } from "@/lib/constants";
import RoutePlanner, {
  type ChildLite,
  type SchoolOption,
} from "@/components/RoutePlanner";
import TraccarSetup from "@/components/TraccarSetup";
import WhatsAppBotButton from "@/components/WhatsAppBotButton";
import { MapPin } from "@/components/icons";
import type { AttendanceRow, AttendanceStatus, BaseRoute, Child, Driver } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverRoutePage() {
  const profile = await requireRole("driver");
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Driver (for served schools), base route, linked children, today's attendance.
  const [{ data: driverRow }, { data: routeRow }, { data: kidRows }] = await Promise.all([
    admin.from("drivers").select("schools,track_token").eq("id", profile.id).maybeSingle(),
    admin.from("routes").select("*").eq("driver_id", profile.id).maybeSingle(),
    admin.from("children").select("*").eq("driver_id", profile.id).order("created_at"),
  ]);
  const driver = driverRow as Pick<Driver, "schools" | "track_token"> | null;
  const base = routeRow as BaseRoute | null;

  let children = (kidRows as Child[] | null) ?? [];
  children = await ensureChildCoords(admin, children, profile.city);

  const childIds = children.map((c) => c.id);
  const { data: attRows } = childIds.length
    ? await admin
        .from("attendance")
        .select("*")
        .eq("date", today)
        .in("child_id", childIds)
    : { data: [] };
  const attendance: Record<string, AttendanceStatus> = {};
  for (const a of (attRows as AttendanceRow[] | null) ?? []) attendance[a.child_id] = a.status;

  // Destination school options (driver's served schools) with coordinates.
  const schoolNames = Array.from(
    new Set([...(driver?.schools ?? []), base?.school_name].filter(Boolean) as string[])
  );
  const { data: schoolDbRows } = schoolNames.length
    ? await admin
        .from("schools")
        .select("name,lat,lng")
        .eq("city", profile.city)
        .in("name", schoolNames)
    : { data: [] };
  const dbMap = new Map(
    (schoolDbRows as { name: string; lat: number; lng: number }[] | null)?.map((s) => [
      s.name,
      { lat: s.lat, lng: s.lng },
    ]) ?? []
  );
  const schoolOptions: SchoolOption[] = schoolNames
    .map((name) => {
      const loc =
        dbMap.get(name) ??
        schoolLocation(profile.city, name) ??
        (base?.school_name === name && base.school_lat != null
          ? { lat: base.school_lat, lng: base.school_lng as number }
          : null);
      return loc ? { name, lat: loc.lat, lng: loc.lng } : null;
    })
    .filter(Boolean) as SchoolOption[];

  const childList: ChildLite[] = children.map((c) => ({
    id: c.id,
    name: c.name,
    school: c.school,
    pickup_address: c.pickup_address,
    pickup_lat: c.pickup_lat,
    pickup_lng: c.pickup_lng,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-title1 text-slate-900">Route optimization</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-slate-500">
          Plan the most efficient pickup &amp; drop-off routes ·
          <span className="inline-flex items-center gap-1 font-medium text-brand-700">
            <MapPin size={14} /> {cityLabel(profile.city)}
          </span>
        </p>
      </div>

      <RoutePlanner
        base={base}
        childList={childList}
        attendance={attendance}
        schoolOptions={schoolOptions}
        city={profile.city}
      />

      <TraccarSetup initialToken={driver?.track_token ?? null} />

      <WhatsAppBotButton />
    </div>
  );
}
