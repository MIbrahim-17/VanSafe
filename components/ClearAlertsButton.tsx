"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "./icons";

/** Clears the parent's alerts, then refreshes the dashboard's alerts feed. */
export default function ClearAlertsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    await fetch("/api/alerts/clear", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={clear}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-rose-600 disabled:opacity-50"
    >
      <Trash size={13} /> {busy ? "Clearing…" : "Clear"}
    </button>
  );
}
