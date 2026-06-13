"use client";

/**
 * AttendanceToggle — lets a parent mark a child present/absent for today.
 * Marking absent notifies the linked driver (handled server-side in /api/attendance).
 */
import { useState } from "react";
import { Check, X } from "./icons";
import type { AttendanceStatus } from "@/lib/types";

export default function AttendanceToggle({
  childId,
  initialStatus,
}: {
  childId: string;
  initialStatus: AttendanceStatus;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const absent = status === "absent";

  async function set(next: AttendanceStatus) {
    if (busy || next === status) return;
    setBusy(true);
    setStatus(next);
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, status: next }),
    });
    if (!res.ok) setStatus(status); // revert on failure
    setBusy(false);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-slate-400">Today:</span>
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
        <button
          onClick={() => set("present")}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            !absent ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Check size={12} /> Present
        </button>
        <button
          onClick={() => set("absent")}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            absent ? "bg-rose-600 text-white" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <X size={12} /> Absent
        </button>
      </div>
    </div>
  );
}
