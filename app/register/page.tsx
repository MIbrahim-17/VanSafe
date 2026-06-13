"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CITIES, VEHICLE_TYPES } from "@/lib/constants";
import type { Role } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("parent");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    whatsapp: "",
    city: "",
    // driver-only vehicle info
    vehicle_type: "Van",
    plate: "",
    capacity: "12",
    make_model: "",
    color: "",
    year: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.city) {
      setError("Please select your city.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    const metadata: Record<string, string> = {
      role,
      name: form.name,
      whatsapp: form.whatsapp,
      city: form.city,
    };
    if (role === "driver") {
      Object.assign(metadata, {
        vehicle_type: form.vehicle_type,
        plate: form.plate,
        capacity: form.capacity,
        make_model: form.make_model,
        color: form.color,
        year: form.year,
      });
    }

    const { data, error: signErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: metadata },
    });

    if (signErr) {
      setError(signErr.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      router.push(role === "driver" ? "/driver/dashboard" : "/parent/dashboard");
      router.refresh();
      return;
    }

    const { data: signIn } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setBusy(false);
    if (signIn.session) {
      router.push(role === "driver" ? "/driver/dashboard" : "/parent/dashboard");
      router.refresh();
    } else {
      setNotice("Account created! Please check your email to confirm, then log in.");
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold text-slate-900">Create your VanSafe account</h1>
      <p className="mt-1 text-sm text-slate-500">Choose how you&apos;ll use VanSafe.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {(["parent", "driver"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`card p-4 text-left transition ${
              role === r ? "ring-2 ring-indigo-500" : "hover:bg-slate-50"
            }`}
          >
            <div className="text-2xl">{r === "parent" ? "👨‍👩‍👧" : "🚐"}</div>
            <div className="mt-1 font-semibold capitalize text-slate-900">
              {r === "parent" ? "Parent" : "Van Driver"}
            </div>
            <div className="text-xs text-slate-500">
              {r === "parent" ? "Find & track a van" : "Offer rides & get found"}
            </div>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <label className="label">WhatsApp number</label>
          <input className="input" required placeholder="+92300…" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
        </div>
        <div>
          <label className="label">City</label>
          <select className="input" required value={form.city} onChange={(e) => update("city", e.target.value)}>
            <option value="" disabled>
              Select your city…
            </option>
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} — {c.urdu}
              </option>
            ))}
          </select>
        </div>

        {role === "driver" && (
          <div className="card space-y-3 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Your vehicle</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Vehicle type</label>
                <select className="input" value={form.vehicle_type} onChange={(e) => update("vehicle_type", e.target.value)}>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reg. plate</label>
                <input className="input" required placeholder="ABC-123" value={form.plate} onChange={(e) => update("plate", e.target.value)} />
              </div>
              <div>
                <label className="label">Make & model</label>
                <input className="input" required placeholder="Toyota Hiace" value={form.make_model} onChange={(e) => update("make_model", e.target.value)} />
              </div>
              <div>
                <label className="label">Colour</label>
                <input className="input" required placeholder="White" value={form.color} onChange={(e) => update("color", e.target.value)} />
              </div>
              <div>
                <label className="label">Seating capacity</label>
                <input className="input" type="number" min={1} required value={form.capacity} onChange={(e) => update("capacity", e.target.value)} />
              </div>
              <div>
                <label className="label">Year <span className="text-slate-400">(optional)</span></label>
                <input className="input" type="number" min={1980} max={2030} placeholder="2018" value={form.year} onChange={(e) => update("year", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : `Sign up as ${role === "parent" ? "Parent" : "Driver"}`}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-600">
          Log in
        </Link>
      </p>
    </div>
  );
}
