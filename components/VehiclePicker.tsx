"use client";

/**
 * VehiclePicker — grouped dropdown of real Pakistan school-van models.
 *
 * Selecting a catalog model auto-fills the standard seating capacity (override
 * allowed for modified vans). "Other — دیگر" reveals a free-text make/model, a
 * required category, and a mandatory manual capacity. Fully controlled: emits a
 * complete VehicleValue on every change so the parent form can persist it.
 */
import {
  VEHICLE_GROUPS,
  VEHICLE_CATEGORIES,
  OTHER_VEHICLE,
  findVehicle,
  isCatalogVehicle,
} from "@/lib/vehicles";

export interface VehicleValue {
  vehicle_model: string; // catalog model name, or "Other"
  make_model: string; // display name (= model name, or typed text for Other)
  vehicle_type: string; // size category
  capacity: string; // driver's actual stated seats
  official_capacity: string; // immutable safety benchmark
}

export const EMPTY_VEHICLE: VehicleValue = {
  vehicle_model: "",
  make_model: "",
  vehicle_type: "",
  capacity: "",
  official_capacity: "",
};

export default function VehiclePicker({
  value,
  onChange,
}: {
  value: VehicleValue;
  onChange: (v: VehicleValue) => void;
}) {
  const isOther =
    value.vehicle_model === OTHER_VEHICLE ||
    (!isCatalogVehicle(value.vehicle_model) && value.make_model !== "");

  const selectValue = isCatalogVehicle(value.vehicle_model)
    ? value.vehicle_model
    : isOther
    ? OTHER_VEHICLE
    : "";

  const catalog = findVehicle(value.vehicle_model);

  function selectModel(v: string) {
    if (v === "") {
      onChange(EMPTY_VEHICLE);
    } else if (v === OTHER_VEHICLE) {
      onChange({
        vehicle_model: OTHER_VEHICLE,
        make_model: isCatalogVehicle(value.vehicle_model) ? "" : value.make_model,
        vehicle_type: value.vehicle_type || "Mini Van",
        capacity: "",
        official_capacity: "",
      });
    } else {
      const m = findVehicle(v)!;
      onChange({
        vehicle_model: v,
        make_model: v,
        vehicle_type: m.category,
        capacity: String(m.capacity),
        official_capacity: String(m.capacity),
      });
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Vehicle model</label>
        <select
          className="input"
          required
          value={selectValue}
          onChange={(e) => selectModel(e.target.value)}
        >
          <option value="" disabled>
            Select your vehicle…
          </option>
          {VEHICLE_GROUPS.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} — {m.capacity} seats
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER_VEHICLE}>Other — دیگر</option>
        </select>
      </div>

      {/* "Other" — manual make/model + required category */}
      {isOther && (
        <>
          <div>
            <label className="label">Make &amp; model</label>
            <input
              className="input"
              required
              placeholder="e.g. Nissan Clipper"
              value={value.make_model}
              onChange={(e) => onChange({ ...value, make_model: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Vehicle category</label>
            <select
              className="input"
              required
              value={value.vehicle_type}
              onChange={(e) => onChange({ ...value, vehicle_type: e.target.value })}
            >
              <option value="" disabled>
                Select category…
              </option>
              {VEHICLE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Capacity: auto-filled & overridable for catalog vans; manual for Other */}
      {(isOther || isCatalogVehicle(value.vehicle_model)) && (
        <div>
          <label className="label">
            Seating capacity {isOther && <span className="text-rose-600">*</span>}
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={30}
            required
            value={value.capacity}
            onChange={(e) =>
              onChange(
                isOther
                  ? { ...value, capacity: e.target.value, official_capacity: e.target.value }
                  : { ...value, capacity: e.target.value }
              )
            }
          />
          {catalog ? (
            <p className="mt-1 text-xs text-slate-400">
              Standard for {catalog.name}: <b>{catalog.capacity} seats</b>. Override only if your
              van is modified — safety checks still use the official limit.
            </p>
          ) : isOther ? (
            <p className="mt-1 text-xs text-slate-400">
              Required — no auto-fill is available for unlisted vehicles.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
