"use client";

import { useState } from "react";
import { OTHER } from "@/lib/schools";
import { useSchoolCatalog } from "@/lib/useSchoolCatalog";

/**
 * City -> Area -> single School selector for parents. Catalog cities use
 * dropdowns with a manual "Other" fallback; other cities use free text.
 */
export default function ParentAreaSchoolPicker({
  city,
  area,
  school,
  onChange,
}: {
  city: string;
  area: string;
  school: string;
  onChange: (area: string, school: string) => void;
}) {
  const cat = useSchoolCatalog(city);
  const [otherChosen, setOtherChosen] = useState(false);

  if (!city) {
    return <p className="text-sm text-slate-500">Select your city first.</p>;
  }

  if (!cat.hasCatalog) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Area</label>
          <input
            className="input"
            value={area}
            onChange={(e) => onChange(e.target.value, school)}
            placeholder="Your area"
          />
        </div>
        <div>
          <label className="label">Child&apos;s school</label>
          <input
            className="input"
            value={school}
            onChange={(e) => onChange(area, e.target.value)}
            placeholder="School name"
          />
        </div>
      </div>
    );
  }

  const catalogSchools = area ? cat.getSchools(area) : [];
  // Show the manual input if the user picked "Other", or the saved school isn't
  // (yet) in the catalog list for this area.
  const inCatalog = catalogSchools.includes(school);
  const showOther = otherChosen || (school !== "" && area !== "" && !inCatalog);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Area</label>
        <select
          className="input"
          value={area}
          onChange={(e) => {
            setOtherChosen(false);
            onChange(e.target.value, "");
          }}
        >
          <option value="">Select area…</option>
          {cat.getAreas().map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Child&apos;s school</label>
        <select
          className="input"
          disabled={!area}
          value={showOther ? OTHER : school}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOtherChosen(true);
              onChange(area, "");
            } else {
              setOtherChosen(false);
              onChange(area, e.target.value);
            }
          }}
        >
          <option value="">{area ? "Select school…" : "Select area first"}</option>
          {catalogSchools.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          {area && <option value={OTHER}>Other (type manually)…</option>}
        </select>
        {showOther && (
          <input
            className="input mt-2"
            value={school}
            onChange={(e) => onChange(area, e.target.value)}
            placeholder="Type your school name"
            autoFocus
          />
        )}
      </div>
    </div>
  );
}
