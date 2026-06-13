"use client";

import { useEffect, useMemo, useState } from "react";
import DriverCard from "./DriverCard";
import { cityLabel } from "@/lib/constants";
import { useSchoolCatalog } from "@/lib/useSchoolCatalog";
import { MapPin } from "./icons";
import type { DriverWithProfile } from "@/lib/types";

type Sort = "rating" | "reviews" | "newest";

export default function DriverExplorer({ mode }: { mode: "browse" | "search" }) {
  const [drivers, setDrivers] = useState<DriverWithProfile[]>([]);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);

  // filters
  const [area, setArea] = useState("");
  const [school, setSchool] = useState("");
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

  // Filter options come from the full scraped school catalog for this city
  // (not just the drivers present), so parents can filter by any real area/school.
  const cat = useSchoolCatalog(city);
  const areaOptions = cat.getAreas();
  const schoolOptions = area ? cat.getSchools(area) : [];

  const filtered = useMemo(() => {
    let list = [...drivers];
    if (area) list = list.filter((d) => d.areas.includes(area));
    if (school) {
      const q = school.toLowerCase();
      list = list.filter((d) => d.schools.some((s) => s.toLowerCase().includes(q)));
    }
    if (verifiedOnly) list = list.filter((d) => d.verified);
    if (seatsOnly)
      list = list.filter((d) => (d.official_capacity || d.capacity) - d.occupancy > 0);

    list.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "reviews") return b.review_count - a.review_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [drivers, area, school, verifiedOnly, seatsOnly, sort]);

  return (
    <div className="space-y-4">
      {city && (
        <div className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800">
          <MapPin size={15} /> Showing van drivers in {cityLabel(city)}
        </div>
      )}

      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className="label">Area</label>
            <select
              className="input"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setSchool(""); // reset school when area changes
              }}
            >
              <option value="">All areas</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="label">School</label>
            <input
              className="input"
              list="browse-school-options"
              value={school}
              disabled={!area}
              placeholder={area ? `Search schools in ${area}…` : "Select an area first"}
              onChange={(e) => setSchool(e.target.value)}
            />
            <datalist id="browse-school-options">
              {schoolOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {mode === "browse" && (
            <>
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
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading vans…</p>
      ) : drivers.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <MapPin size={24} />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">
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
