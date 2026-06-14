"use client";

import { useState } from "react";
import ParentAreaSchoolPicker from "./ParentAreaSchoolPicker";
import LocationPicker from "./LocationPicker";

export interface ChildValues {
  name: string;
  school: string;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
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
  const [lat, setLat] = useState<number | null>(initial?.pickup_lat ?? null);
  const [lng, setLng] = useState<number | null>(initial?.pickup_lng ?? null);

  const pinned = lat != null && lng != null;

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
        <div className="flex gap-2">
          <input
            className="input"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="House, block, area"
          />
          <LocationPicker
            value={{ lat, lng, address: pickup }}
            city={city}
            title="Pin pickup location"
            onChange={(v) => {
              setLat(v.lat);
              setLng(v.lng);
              setPickup(v.address);
            }}
          />
        </div>
        {!pinned && (
          <p className="mt-1 text-xs text-amber-600">
            Drop a pin so the driver can route to the exact pickup spot.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !name.trim() || !pinned}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              school,
              pickup_address: pickup,
              pickup_lat: lat,
              pickup_lng: lng,
            })
          }
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
