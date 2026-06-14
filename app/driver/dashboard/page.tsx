import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StarRating from "@/components/StarRating";
import OccupancyBar from "@/components/OccupancyBar";
import FuelChart, { type FuelDay } from "@/components/FuelChart";
import { MapPin, Play, Message, Route, Sparkles } from "@/components/icons";
import { whatsappLink, formatPKR } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import type { Child, Driver, Profile, RouteLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverDashboard() {
  const profile = await requireRole("driver");
  const supabase = createClient();

  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", profile.id)
    .single();
  const d = driver as Driver | null;

  const { data: kids } = await supabase
    .from("children")
    .select("*")
    .eq("driver_id", profile.id);
  const childRows = (kids as Child[] | null) ?? [];

  // Fuel-savings history (last ~31 days) for the savings dashboard.
  const since = new Date(Date.now() - 31 * 86400_000).toISOString().slice(0, 10);
  const { data: logRows } = await supabase
    .from("route_logs")
    .select("*")
    .eq("driver_id", profile.id)
    .gte("date", since)
    .order("date");
  const logs = (logRows as RouteLog[] | null) ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const sum = (rows: RouteLog[], key: "fuel_saved" | "fuel_cost") =>
    rows.reduce((t, r) => t + Number(r[key]), 0);
  const savedToday = sum(logs.filter((l) => l.date === today), "fuel_saved");
  const savedWeek = sum(logs.filter((l) => l.date >= weekStart), "fuel_saved");
  const savedMonth = sum(logs.filter((l) => l.date >= monthStart), "fuel_saved");

  // Per-day series (morning + afternoon combined) for the 30-day chart.
  const byDay = new Map<string, FuelDay>();
  for (const l of logs) {
    const e = byDay.get(l.date) ?? { date: l.date, cost: 0, saved: 0 };
    e.cost += Number(l.fuel_cost);
    e.saved += Number(l.fuel_saved);
    byDay.set(l.date, e);
  }
  const chart = Array.from(byDay.values()).slice(-30);

  const parentIds = Array.from(new Set(childRows.map((c) => c.parent_id)));
  const { data: parents } = parentIds.length
    ? await supabase.from("profiles").select("id,name,whatsapp").in("id", parentIds)
    : { data: [] };
  const parentMap = new Map(
    (parents as Pick<Profile, "id" | "name" | "whatsapp">[] | null)?.map((p) => [p.id, p]) ?? []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title1 text-slate-900">Hi, {profile.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-slate-500">
            Your VanSafe driver dashboard ·
            <span className="inline-flex items-center gap-1 font-medium text-brand-700">
              <MapPin size={14} /> {cityLabel(profile.city)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/driver/route" className="btn-primary"><Route size={15} /> Plan Route</Link>
          <Link href="/driver/track" className="btn-green"><Play size={15} /> Start Tracking</Link>
          <Link href="/driver/profile/edit" className="btn-ghost">Edit Profile</Link>
          <Link href={`/driver/${profile.id}`} className="btn-ghost">View Public Profile</Link>
        </div>
      </div>

      {/* Fuel savings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card flex flex-col justify-center bg-gradient-to-br from-brand-50 to-white p-6">
          <p className="text-[13px] font-medium text-brand-800">Saved this month — اس مہینے بچائے</p>
          <p className="text-largetitle mt-1 text-brand-700">{formatPKR(savedMonth)}</p>
          <p className="mt-1 text-footnote text-brand-700/70">in fuel, vs unoptimized routes</p>
          <div className="mt-5 flex gap-6 text-[15px]">
            <div>
              <p className="text-footnote text-slate-400">Today</p>
              <p className="font-semibold text-slate-800">{formatPKR(savedToday)}</p>
            </div>
            <div>
              <p className="text-footnote text-slate-400">This week</p>
              <p className="font-semibold text-slate-800">{formatPKR(savedWeek)}</p>
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-title3 flex items-center gap-2 text-slate-900">
              <Sparkles size={16} className="text-brand-600" /> Daily fuel cost — last 30 days
            </h2>
            <Link href="/driver/route" className="text-sm font-medium text-brand-700">
              Optimize today →
            </Link>
          </div>
          <FuelChart data={chart} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Passengers</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{childRows.length}</p>
          <p className="text-xs text-slate-400">{parentIds.length} parent(s)</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Rating</p>
          <div className="mt-2">
            <StarRating value={d?.rating ?? 0} count={d?.review_count ?? 0} size="lg" />
          </div>
        </div>
        <div className="card p-4">
          <p className="mb-2 text-sm text-slate-500">Occupancy</p>
          <OccupancyBar
            occupancy={d?.occupancy ?? 0}
            capacity={d?.official_capacity || d?.capacity || 0}
          />
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-title3 mb-3 text-slate-900">Passengers</h2>
        {childRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No children linked yet. Complete your{" "}
            <Link href="/driver/profile/edit" className="text-brand-700">profile</Link> so parents can find you.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {childRows.map((c) => {
              const parent = parentMap.get(c.parent_id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{c.name}</p>
                    <p className="text-sm text-slate-500">
                      {c.school || "—"} · Parent: {parent?.name ?? "—"}
                    </p>
                  </div>
                  {parent?.whatsapp && (
                    <a
                      className="btn-green"
                      href={whatsappLink(parent.whatsapp)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Message size={15} /> WhatsApp
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
