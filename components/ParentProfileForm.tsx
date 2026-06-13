"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CITIES } from "@/lib/constants";
import ParentAreaSchoolPicker from "@/components/ParentAreaSchoolPicker";
import type { Profile } from "@/lib/types";

export default function ParentProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    name: profile.name,
    whatsapp: profile.whatsapp,
    city: profile.city ?? "",
  });
  const [area, setArea] = useState(profile.area ?? "");
  const [school, setSchool] = useState(profile.school ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.city) {
      setError("Please select your city.");
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ name: form.name, whatsapp: form.whatsapp, city: form.city, area, school })
      .eq("id", profile.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Profile saved ✓ — your van results now match your city.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <div>
        <label className="label">Name</label>
        <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} />
      </div>
      <div>
        <label className="label">WhatsApp</label>
        <input className="input" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
      </div>
      <div>
        <label className="label">City</label>
        <select
          className="input"
          value={form.city}
          onChange={(e) => {
            update("city", e.target.value);
            setArea("");
            setSchool("");
          }}
        >
          <option value="" disabled>Select your city…</option>
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name} — {c.urdu}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Changing your city updates which van drivers you see everywhere.
        </p>
      </div>

      {form.city && (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Your area &amp; child&apos;s school
          </p>
          <ParentAreaSchoolPicker
            city={form.city}
            area={area}
            school={school}
            onChange={(a, s) => {
              setArea(a);
              setSchool(s);
            }}
          />
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
