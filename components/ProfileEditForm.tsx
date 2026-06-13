"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CITIES, VEHICLE_TYPES } from "@/lib/constants";
import type { Driver, Profile } from "@/lib/types";

export default function ProfileEditForm({
  profile,
  driver,
}: {
  profile: Profile;
  driver: Driver;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: profile.name,
    whatsapp: profile.whatsapp,
    city: profile.city ?? "",
    area: driver?.area ?? "",
    schools: (driver?.schools ?? []).join(", "),
    vehicle_type: driver?.vehicle_type ?? "Van",
    plate: driver?.plate ?? "",
    capacity: driver?.capacity ?? 12,
    occupancy: driver?.occupancy ?? 0,
    make_model: driver?.make_model ?? "",
    color: driver?.color ?? "",
    year: driver?.year ?? "",
    bio: driver?.bio ?? "",
  });
  const [cnicUrl, setCnicUrl] = useState(driver?.cnic_url ?? "");
  const [vehicleUrl, setVehicleUrl] = useState(driver?.vehicle_doc_url ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function update(k: keyof typeof form, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function upload(kind: "cnic" | "vehicle", file: File) {
    setError("");
    const path = `${profile.id}/${kind}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`);
      return;
    }
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    const url = data.publicUrl;
    if (kind === "cnic") {
      setCnicUrl(url);
      await supabase.from("drivers").update({ cnic_url: url }).eq("id", profile.id);
    } else {
      setVehicleUrl(url);
      await supabase.from("drivers").update({ vehicle_doc_url: url }).eq("id", profile.id);
    }
    setMsg("Document uploaded ✓");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ name: form.name, whatsapp: form.whatsapp, city: form.city })
      .eq("id", profile.id);

    const { error: dErr } = await supabase
      .from("drivers")
      .update({
        area: form.area,
        schools: form.schools
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        vehicle_type: form.vehicle_type,
        plate: form.plate,
        capacity: Number(form.capacity),
        occupancy: Number(form.occupancy),
        make_model: form.make_model,
        color: form.color,
        year: form.year === "" ? null : Number(form.year),
        bio: form.bio,
      })
      .eq("id", profile.id);

    setBusy(false);
    if (pErr || dErr) {
      setError(pErr?.message ?? dErr?.message ?? "Could not save.");
      return;
    }
    setMsg("Profile saved ✓");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">About you</h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
            <select className="input" value={form.city} onChange={(e) => update("city", e.target.value)}>
              <option value="" disabled>Select your city…</option>
              {CITIES.map((c) => (
                <option key={c.name} value={c.name}>{c.name} — {c.urdu}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Area served</label>
            <input className="input" value={form.area} onChange={(e) => update("area", e.target.value)} placeholder="e.g. Gulshan-e-Iqbal" />
          </div>
          <div>
            <label className="label">Schools served (comma separated)</label>
            <input className="input" value={form.schools} onChange={(e) => update("schools", e.target.value)} placeholder="The City School, Beaconhouse" />
          </div>
        </div>
        <div>
          <label className="label">Short bio</label>
          <textarea className="input min-h-[70px]" value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder="Tell parents about your experience…" />
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">Vehicle</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Vehicle type</label>
            <select className="input" value={form.vehicle_type} onChange={(e) => update("vehicle_type", e.target.value)}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Registration plate</label>
            <input className="input" value={form.plate} onChange={(e) => update("plate", e.target.value)} placeholder="ABC-123" />
          </div>
          <div>
            <label className="label">Make &amp; model</label>
            <input className="input" value={form.make_model} onChange={(e) => update("make_model", e.target.value)} placeholder="Toyota Hiace" />
          </div>
          <div>
            <label className="label">Colour</label>
            <input className="input" value={form.color} onChange={(e) => update("color", e.target.value)} placeholder="White" />
          </div>
          <div>
            <label className="label">Year</label>
            <input className="input" type="number" min={1980} max={2030} value={form.year} onChange={(e) => update("year", e.target.value)} placeholder="2018" />
          </div>
          <div>
            <label className="label">Seating capacity</label>
            <input className="input" type="number" min={1} value={form.capacity} onChange={(e) => update("capacity", e.target.value)} />
          </div>
          <div>
            <label className="label">Current occupancy</label>
            <input className="input" type="number" min={0} value={form.occupancy} onChange={(e) => update("occupancy", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">Documents</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">
              CNIC {cnicUrl && <span className="badge bg-emerald-100 text-emerald-700">uploaded ✓</span>}
            </label>
            <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && upload("cnic", e.target.files[0])} />
          </div>
          <div>
            <label className="label">
              Vehicle documents {vehicleUrl && <span className="badge bg-emerald-100 text-emerald-700">uploaded ✓</span>}
            </label>
            <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && upload("vehicle", e.target.files[0])} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Uploading your documents helps parents trust you and is required for VanSafe verification.
        </p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
