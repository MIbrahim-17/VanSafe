"use client";

import { useState } from "react";
import DriverCard from "@/components/DriverCard";
import { cityLabel } from "@/lib/constants";
import type { DriverWithProfile, MatchResult } from "@/lib/types";

interface Ranked {
  match: MatchResult;
  driver: DriverWithProfile;
}

export default function MatchPage() {
  const [form, setForm] = useState({ school: "", area: "", children: 1 });
  const [results, setResults] = useState<Ranked[] | null>(null);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  function update(k: keyof typeof form, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResults(null);
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    setResults(j.ranked ?? []);
    setCity(j.city ?? "");
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🤖 AI Van Matching</h1>
        <p className="text-sm text-slate-500">
          Tell us your needs and AI ranks the best vans for your child.
        </p>
      </div>

      <form onSubmit={run} className="card grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">School</label>
          <input className="input" value={form.school} onChange={(e) => update("school", e.target.value)} placeholder="The City School" />
        </div>
        <div>
          <label className="label">Area</label>
          <input className="input" value={form.area} onChange={(e) => update("area", e.target.value)} placeholder="Gulshan" />
        </div>
        <div>
          <label className="label">Children</label>
          <input className="input" type="number" min={1} value={form.children} onChange={(e) => update("children", Number(e.target.value))} />
        </div>
        <div className="sm:col-span-4">
          <button className="btn-primary" disabled={busy}>
            {busy ? "Finding best matches…" : "Find my matches"}
          </button>
        </div>
      </form>

      {results && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl">🗺️</div>
              <h3 className="mt-2 font-semibold text-slate-900">
                No van drivers in {city ? cityLabel(city) : "your city"} yet
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                As soon as a driver registers in your city, they&apos;ll show up here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Ranked {results.length} van(s) in {cityLabel(city)} for you
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {results.map(({ match, driver }) => (
                  <DriverCard key={driver.id} driver={driver} match={match} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
