"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LinkButton({
  driverId,
  linkedHere,
  linkedElsewhere,
}: {
  driverId: string;
  linkedHere: boolean;
  linkedElsewhere: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    const { error: insErr } = await supabase.from("links").insert({
      parent_id: user.id,
      driver_id: driverId,
      child_name: child,
      school,
    });
    setBusy(false);
    if (insErr) {
      setError(
        insErr.code === "23505"
          ? "You're already linked to another van. Unlink it first."
          : insErr.message
      );
      return;
    }
    router.push("/parent/dashboard");
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("links").delete().eq("parent_id", user.id);
    setBusy(false);
    router.refresh();
  }

  if (linkedHere) {
    return (
      <div className="space-y-2">
        <span className="badge bg-emerald-100 text-emerald-700">✔ Your child rides with this van</span>
        <button onClick={unlink} disabled={busy} className="btn-ghost w-full">
          Unlink this van
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full">
        🔗 Link my child to this van
      </button>
    );
  }

  return (
    <form onSubmit={link} className="space-y-2">
      {linkedElsewhere && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          You&apos;re currently linked to another van. Linking here will be blocked until you unlink.
        </p>
      )}
      <input className="input" required placeholder="Child's name" value={child} onChange={(e) => setChild(e.target.value)} />
      <input className="input" required placeholder="School" value={school} onChange={(e) => setSchool(e.target.value)} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>
          {busy ? "Linking…" : "Confirm link"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
