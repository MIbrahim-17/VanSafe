import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LiveStatusPanel from "@/components/LiveStatusPanel";
import WhatsAppSimPanel from "@/components/WhatsAppSimPanel";
import DemoMode from "@/components/DemoMode";
import { relativeTime } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import type { AlertRow, Driver, LinkRow, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALERT_ICON: Record<string, string> = {
  departed: "🚐",
  arrived: "🏫",
  stationary: "⏱️",
  route_deviation: "🧭",
  info: "ℹ️",
};

export default async function ParentDashboard() {
  const profile = await requireRole("parent");
  const supabase = createClient();

  const { data: link } = await supabase
    .from("links")
    .select("*")
    .eq("parent_id", profile.id)
    .maybeSingle();
  const linkRow = link as LinkRow | null;

  let driver: Driver | null = null;
  let driverProfile: Pick<Profile, "name" | "whatsapp"> | null = null;
  if (linkRow) {
    const { data: d } = await supabase
      .from("drivers")
      .select("*")
      .eq("id", linkRow.driver_id)
      .single();
    driver = d as Driver | null;
    const { data: dp } = await supabase
      .from("profiles")
      .select("name,whatsapp")
      .eq("id", linkRow.driver_id)
      .single();
    driverProfile = dp as Pick<Profile, "name" | "whatsapp"> | null;
  }

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("parent_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(8);
  const alertRows = (alerts as AlertRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hi, {profile.name} 👋</h1>
          <p className="text-sm text-slate-500">
            Your VanSafe parent dashboard ·{" "}
            <span className="font-medium text-indigo-600">📍 {cityLabel(profile.city)}</span>
          </p>
        </div>
        <Link href="/parent/profile/edit" className="btn-ghost">
          Edit profile
        </Link>
      </div>

      {!linkRow ? (
        <div className="card p-8 text-center">
          <div className="text-4xl">🔍</div>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            You haven&apos;t linked a van yet
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Find the right van for your child and start tracking instantly.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/parent/match" className="btn-primary">🤖 AI Match</Link>
            <Link href="/parent/browse" className="btn-ghost">Browse all vans</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Tracking van for</p>
                  <p className="font-semibold text-slate-900">
                    {linkRow.child_name} · {linkRow.school}
                  </p>
                </div>
                <Link href={`/driver/${linkRow.driver_id}`} className="btn-ghost">
                  View driver
                </Link>
              </div>
            </div>

            {driver && driverProfile && (
              <LiveStatusPanel
                driverId={driver.id}
                driverName={driverProfile.name}
                driverWhatsapp={driverProfile.whatsapp}
              />
            )}

            <DemoMode driverId={linkRow.driver_id} />

            <div className="card p-4">
              <h2 className="mb-3 font-semibold text-slate-900">Recent alerts</h2>
              {alertRows.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No alerts yet. You&apos;ll be notified on departure, arrival and anything unusual.
                </p>
              ) : (
                <ul className="space-y-2">
                  {alertRows.map((a) => (
                    <li key={a.id} className="flex gap-2 rounded-xl bg-slate-50 p-2.5 text-sm">
                      <span>{ALERT_ICON[a.type] ?? "•"}</span>
                      <div>
                        <p className="text-slate-700">{a.message}</p>
                        <p className="text-xs text-slate-400">{relativeTime(a.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900">Ask the VanSafe bot</h2>
            <WhatsAppSimPanel whatsapp={profile.whatsapp} />
          </div>
        </div>
      )}
    </div>
  );
}
