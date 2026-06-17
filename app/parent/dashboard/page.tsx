import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import WhatsAppSimPanel from "@/components/WhatsAppSimPanel";
import WhatsAppBotButton from "@/components/WhatsAppBotButton";
import DemoMode from "@/components/DemoMode";
import ChildCard, { type CardColor } from "@/components/ChildCard";
import AddChild from "@/components/AddChild";
import ClearAlertsButton from "@/components/ClearAlertsButton";
import { relativeTime } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import { schoolLocation } from "@/lib/schools";
import { Bus, School, Clock, Route, Alert, MapPin, User } from "@/components/icons";
import type { AlertRow, AttendanceRow, AttendanceStatus, Child, Profile } from "@/lib/types";
import type { ComponentType } from "react";

export const dynamic = "force-dynamic";

const ALERT_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  departed: Bus,
  arrived: School,
  stationary: Clock,
  route_deviation: Route,
  traffic_delay: Clock,
  arriving_soon: Bus,
  info: Alert,
};

// Distinct accent per child so cards are never confused.
const COLORS: CardColor[] = [
  { dot: "bg-brand-600", ring: "border-l-brand-600" },
  { dot: "bg-sky-600", ring: "border-l-sky-600" },
  { dot: "bg-amber-500", ring: "border-l-amber-500" },
  { dot: "bg-violet-600", ring: "border-l-violet-600" },
  { dot: "bg-rose-500", ring: "border-l-rose-500" },
];

export default async function ParentDashboard() {
  const profile = await requireRole("parent");
  const supabase = createClient();

  const { data: kids } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", profile.id)
    .order("created_at");
  const children = (kids as Child[] | null) ?? [];

  // Driver name/whatsapp for every linked child.
  const driverIds = Array.from(
    new Set(children.map((c) => c.driver_id).filter(Boolean) as string[])
  );
  const { data: driverProfiles } = driverIds.length
    ? await supabase.from("profiles").select("id,name,whatsapp").in("id", driverIds)
    : { data: [] };
  const driverMap = new Map(
    (driverProfiles as Pick<Profile, "id" | "name" | "whatsapp">[] | null)?.map((d) => [d.id, d]) ?? []
  );

  // School marker coords for each child (DB schools first, static fallback).
  const schoolNames = Array.from(new Set(children.map((c) => c.school).filter(Boolean)));
  const { data: schoolRows } = schoolNames.length
    ? await supabase
        .from("schools")
        .select("name,lat,lng")
        .eq("city", profile.city)
        .in("name", schoolNames)
    : { data: [] };
  const schoolMap = new Map(
    (schoolRows as { name: string; lat: number; lng: number }[] | null)?.map((s) => [
      s.name,
      { lat: s.lat, lng: s.lng },
    ]) ?? []
  );

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("parent_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(8);
  const alertRows = (alerts as AlertRow[] | null) ?? [];

  // Today's attendance for this parent's children (default present).
  const today = new Date().toISOString().slice(0, 10);
  const { data: attRows } = children.length
    ? await supabase
        .from("attendance")
        .select("*")
        .eq("parent_id", profile.id)
        .eq("date", today)
    : { data: [] };
  const attendanceMap = new Map(
    (attRows as AttendanceRow[] | null)?.map((a) => [a.child_id, a.status as AttendanceStatus]) ?? []
  );

  // Linked children become selectable targets for Demo Mode.
  const demoTargets = children
    .filter((c) => c.driver_id)
    .map((c) => ({
      childId: c.id,
      childName: c.name,
      driverId: c.driver_id as string,
      driverName: driverMap.get(c.driver_id as string)?.name ?? "Driver",
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title1 text-slate-900">Hi, {profile.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-slate-500">
            Your VanSafe parent dashboard ·
            <span className="inline-flex items-center gap-1 font-medium text-brand-700">
              <MapPin size={14} /> {cityLabel(profile.city)}
            </span>
          </p>
        </div>
        <Link href="/parent/profile/edit" className="btn-ghost">
          Edit profile
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Children column */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-title3 text-slate-900">
              My children {children.length > 0 && <span className="text-slate-400">({children.length})</span>}
            </h2>
            <AddChild city={profile.city} count={children.length} />
          </div>

          {children.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <User size={26} />
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Add your first child</h3>
              <p className="mt-1 text-sm text-slate-500">
                Add a child, then link them to a trusted van to start tracking.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {children.map((child, i) => {
                const d = child.driver_id ? driverMap.get(child.driver_id) : undefined;
                const loc =
                  schoolMap.get(child.school) ?? schoolLocation(profile.city, child.school);
                return (
                  <ChildCard
                    key={child.id}
                    child={child}
                    city={profile.city}
                    color={COLORS[i % COLORS.length]}
                    driverName={d?.name}
                    driverWhatsapp={d?.whatsapp}
                    school={loc ? { ...loc, name: child.school } : null}
                    attendanceStatus={attendanceMap.get(child.id) ?? "present"}
                  />
                );
              })}
            </div>
          )}

          {demoTargets.length > 0 && <DemoMode targets={demoTargets} />}

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-title3 text-slate-900">Recent alerts</h2>
              {alertRows.length > 0 && <ClearAlertsButton />}
            </div>
            {alertRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No alerts yet. You&apos;ll be notified on departure, arrival and anything unusual.
              </p>
            ) : (
              <ul className="space-y-2">
                {alertRows.map((a) => {
                  const Ico = ALERT_ICON[a.type] ?? Alert;
                  return (
                    <li key={a.id} className="flex gap-3 rounded-lg bg-slate-50 p-2.5 text-sm">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-slate-200">
                        <Ico size={15} />
                      </span>
                      <div>
                        <p className="text-slate-700">{a.message}</p>
                        <p className="text-xs text-slate-400">{relativeTime(a.created_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Bot column */}
        <div className="space-y-3">
          <h2 className="text-title3 mb-2 text-slate-900">Ask the VanSafe bot</h2>
          <WhatsAppSimPanel whatsapp={profile.whatsapp} />
          <WhatsAppBotButton />
        </div>
      </div>
    </div>
  );
}
