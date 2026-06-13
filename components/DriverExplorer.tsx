"use client";

import { useEffect, useMemo, useState } from "react";
import DriverCard from "./DriverCard";
import { cityLabel } from "@/lib/constants";
import type { DriverWithProfile } from "@/lib/types";

type Sort = "rating" | "reviews" | "newest";

export default function DriverExplorer({ mode }: { mode: "browse" | "search" }) {
  const [drivers, setDrivers] = useState<DriverWithProfile[]>([]);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);

  // shared filters
  const [school, setSchool] = useState("");
  const [area, setArea] = useState("");
  // browse-only
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [seatsOnly, setSeatsOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("rating");

  useEffect(() => {
    fetch("/api/drivers")
      .then((r) => r.json())
      .then((j) => {
        setDrivers(j.drivers ?? []);
        setCity(j.city ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const schools = useMemo(
    () => Array.from(new Set(drivers.flatMap((d) => d.schools))).sort(),
    [drivers]
  );

  const filtered = useMemo(() => {
    let list = [...drivers];
    if (school)
      list = list.filter((d) =>
        d.schools.some((s) => s.toLowerCase().includes(school.toLowerCase()))
      );
    if (area) list = list.filter((d) => d.area.toLowerCase().includes(area.toLowerCase()));
    if (verifiedOnly) list = list.filter((d) => d.verified);
    if (seatsOnly) list = list.filter((d) => d.capacity - d.occupancy > 0);

    list.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "reviews") return b.review_count - a.review_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [drivers, school, area, verifiedOnly, seatsOnly, sort]);

  return (
    <div className="space-y-4">
      {city && (
        <div className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
          📍 Showing van drivers in {cityLabel(city)}
        </div>
      )}

      <div className="card p-4">
        {mode === "search" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">School</label>
              <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. The City School" />
            </div>
            <div>
              <label className="label">Area</label>
              <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Gulshan-e-Iqbal" />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="label">School</label>
              <select className="input" value={school} onChange={(e) => setSchool(e.target.value)}>
                <option value="">All schools</option>
                {schools.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sort by</label>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="rating">Highest rating</option>
                <option value="reviews">Most reviews</option>
                <option value="newest">Newest</option>
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
              Verified only
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={seatsOnly} onChange={(e) => setSeatsOnly(e.target.checked)} />
              Seats available
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading vans…</p>
      ) : drivers.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl">🗺️</div>
          <h3 className="mt-2 font-semibold text-slate-900">
            No van drivers in {city ? cityLabel(city) : "your city"} yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            We&apos;re growing fast — check back soon, or invite a driver you trust to join VanSafe.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No vans match your filters.</p>
      ) : (
        <>
          <p className="text-sm text-slate-500">{filtered.length} van(s) found</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((d) => (
              <DriverCard key={d.id} driver={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
