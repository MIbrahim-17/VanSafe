"use client";

import { useState } from "react";
import ParentAreaSchoolPicker from "./ParentAreaSchoolPicker";

export interface ChildValues {
  name: string;
  school: string;
  pickup_address: string;
}

/** Shared add/edit form for a child (name, school via city→area→school, pickup). */
export default function ChildForm({
  city,
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  city: string;
  initial?: Partial<ChildValues>;
  submitLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (values: ChildValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [area, setArea] = useState("");
  const [school, setSchool] = useState(initial?.school ?? "");
  const [pickup, setPickup] = useState(initial?.pickup_address ?? "");

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Child&apos;s name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" />
      </div>
      <div>
        <p className="label">School</p>
        <ParentAreaSchoolPicker
          city={city}
          area={area}
          school={school}
          onChange={(a, s) => {
            setArea(a);
            setSchool(s);
          }}
        />
      </div>
      <div>
        <label className="label">Pickup address</label>
        <input className="input" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="House, block, area" />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !name.trim()}
          onClick={() => onSubmit({ name: name.trim(), school, pickup_address: pickup })}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
