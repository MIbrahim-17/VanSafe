import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StarRating from "@/components/StarRating";
import OccupancyBar from "@/components/OccupancyBar";
import { MapPin, Play, Message } from "@/components/icons";
import { whatsappLink } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import type { Child, Driver, Profile } from "@/lib/types";

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
          <h1 className="text-2xl font-bold text-slate-900">Hi, {profile.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Your VanSafe driver dashboard ·
            <span className="inline-flex items-center gap-1 font-medium text-brand-700">
              <MapPin size={14} /> {cityLabel(profile.city)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/driver/track" className="btn-green"><Play size={15} /> Start Tracking</Link>
          <Link href="/driver/profile/edit" className="btn-ghost">Edit Profile</Link>
          <Link href={`/driver/${profile.id}`} className="btn-ghost">View Public Profile</Link>
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
        <h2 className="mb-3 font-semibold text-slate-900">Passengers</h2>
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
