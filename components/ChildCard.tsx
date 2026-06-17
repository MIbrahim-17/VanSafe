"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ChildForm, { type ChildValues } from "./ChildForm";
import AttendanceToggle from "./AttendanceToggle";
import { MapPin, Message, Pencil, Trash } from "./icons";
import { deriveStatus, googleMapsLink, relativeTime, whatsappLink } from "@/lib/utils";
import type { AttendanceStatus, Child, LocationPing } from "@/lib/types";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-slate-100" />,
});

const STATUS_STYLES: Record<string, string> = {
  moving: "bg-emerald-100 text-emerald-700",
  stopped: "bg-amber-100 text-amber-700",
  no_signal: "bg-slate-200 text-slate-600",
  idle: "bg-slate-200 text-slate-600",
};

export interface CardColor {
  dot: string;
  ring: string;
}

export default function ChildCard({
  child,
  driverName,
  driverWhatsapp,
  school,
  color,
  city,
  attendanceStatus,
}: {
  child: Child;
  driverName?: string;
  driverWhatsapp?: string;
  school?: { lat: number; lng: number; name: string } | null;
  color: CardColor;
  city: string;
  attendanceStatus?: AttendanceStatus;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!child.driver_id) return;
    const res = await fetch(`/api/locations?driverId=${child.driver_id}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setPings(j.history ?? []);
    }
  }, [child.driver_id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function save(values: ChildValues) {
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("children")
      .update({
        name: values.name,
        school: values.school,
        pickup_address: values.pickup_address,
        pickup_lat: values.pickup_lat,
        pickup_lng: values.pickup_lng,
      })
      .eq("id", child.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${child.name} from your account?`)) return;
    await supabase.from("children").delete().eq("id", child.id);
    router.refresh();
  }

  if (editing) {
    return (
      <div className={`card border-l-4 ${color.ring} p-4`}>
        <h3 className="mb-3 font-semibold text-slate-900">Edit {child.name}</h3>
        <ChildForm
          city={city}
          initial={child}
          submitLabel="Save changes"
          busy={busy}
          error={error}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const { status, label } = deriveStatus(pings);
  const latest = pings[0];

  return (
    <div className={`card border-l-4 ${color.ring} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
            <h3 className="truncate font-semibold text-slate-900">{child.name}</h3>
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{child.school || "No school set"}</p>
          {child.pickup_address && (
            <p className="flex items-center gap-1 truncate text-xs text-slate-400">
              <MapPin size={12} className="shrink-0" /> {child.pickup_address}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Edit ${child.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={remove}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Remove ${child.name}`}
          >
            <Trash size={15} />
          </button>
        </div>
      </div>

      {!child.driver_id ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
          <span className="text-sm text-slate-500">Not linked to a van yet</span>
          <Link href="/parent/browse" className="btn-primary shrink-0 text-xs">
            Find a Van
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${STATUS_STYLES[status]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> {label}
            </span>
            {driverName && <span className="text-sm text-slate-600">Driver: {driverName}</span>}
            {latest && <span className="text-xs text-slate-400">· {relativeTime(latest.created_at)}</span>}
          </div>

          <div className="mt-2">
            <AttendanceToggle childId={child.id} initialStatus={attendanceStatus ?? "present"} />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {latest && (
              <a className="btn-ghost text-xs" href={googleMapsLink(latest.lat, latest.lng)} target="_blank" rel="noreferrer">
                <MapPin size={14} /> Maps
              </a>
            )}
            {driverWhatsapp && (
              <a className="btn-green text-xs" href={whatsappLink(driverWhatsapp)} target="_blank" rel="noreferrer">
                <Message size={14} /> WhatsApp
              </a>
            )}
            <button onClick={() => setExpanded((v) => !v)} className="btn-ghost text-xs">
              {expanded ? "Hide map" : "Live map"}
            </button>
          </div>

          {expanded && (
            <div className="mt-3">
              <LiveMap
                pings={pings}
                school={school}
                home={
                  child.pickup_lat != null && child.pickup_lng != null
                    ? { lat: child.pickup_lat, lng: child.pickup_lng }
                    : null
                }
              />
              {pings.length > 0 && (
                <ol className="mt-2 space-y-1 text-xs text-slate-500">
                  {pings.slice(0, 10).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <a className="text-brand-700 hover:underline" href={googleMapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer">
                        {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                      </a>
                      <span>{relativeTime(p.created_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
