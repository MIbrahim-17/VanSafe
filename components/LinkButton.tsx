"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Child } from "@/lib/types";

/**
 * Per-child linking on a driver's public profile. Each of the parent's children
 * can be independently linked to / unlinked from this van.
 */
export default function LinkButton({
  driverId,
  kids,
}: {
  driverId: string;
  kids: Child[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setDriver(childId: string, value: string | null) {
    setBusyId(childId);
    setError("");
    const { error: err } = await supabase
      .from("children")
      .update({ driver_id: value })
      .eq("id", childId);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  if (kids.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add a child on your{" "}
        <Link href="/parent/dashboard" className="text-brand-700">
          dashboard
        </Link>{" "}
        first, then link them to this van.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Link a child to this van</p>
      {kids.map((c) => {
        const here = c.driver_id === driverId;
        const elsewhere = c.driver_id && c.driver_id !== driverId;
        const busy = busyId === c.id;
        return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
              <p className="truncate text-xs text-slate-400">{c.school || "No school set"}</p>
            </div>
            {here ? (
              <button onClick={() => setDriver(c.id, null)} disabled={busy} className="btn-ghost shrink-0 text-xs">
                {busy ? "…" : "Unlink"}
              </button>
            ) : (
              <button
                onClick={() => setDriver(c.id, driverId)}
                disabled={busy}
                className="btn-primary shrink-0 text-xs"
                title={elsewhere ? "Move this child to this van" : undefined}
              >
                {busy ? "…" : elsewhere ? "Switch here" : "Link"}
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
