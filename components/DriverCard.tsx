import Link from "next/link";
import StarRating from "./StarRating";
import OccupancyBar from "./OccupancyBar";
import CapacityBadge from "./CapacityBadge";
import { MapPin, Shield, Sparkles } from "./icons";
import { benchmarkCapacity } from "@/lib/vehicles";
import type { DriverWithProfile } from "@/lib/types";

export default function DriverCard({
  driver,
  match,
}: {
  driver: DriverWithProfile;
  match?: { score: number; reason: string };
}) {
  return (
    <Link
      href={`/driver/${driver.id}`}
      className="card card-hover block p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{driver.profile.name}</h3>
            {driver.verified && (
              <span className="badge bg-brand-100 text-brand-800">
                <Shield size={12} /> Verified
              </span>
            )}
            <span className="badge bg-slate-100 text-slate-600">{driver.vehicle_type}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            <span className="truncate">
              {driver.profile.city || "—"}
              {driver.areas?.length ? ` · ${driver.areas.join(", ")}` : ""}
            </span>
          </p>
          {(driver.make_model || driver.vehicle_model) && (
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {driver.make_model || driver.vehicle_model}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StarRating value={driver.rating} count={driver.review_count} />
          <CapacityBadge
            occupancy={driver.occupancy}
            capacity={benchmarkCapacity(driver.vehicle_model, driver.official_capacity || driver.capacity)}
          />
        </div>
      </div>

      {match && (
        <div className="mb-3 rounded-xl bg-brand-50 p-3 text-sm ring-1 ring-brand-100">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-800">
              <Sparkles size={14} /> AI match
            </span>
            <span className="badge bg-brand-700 text-white">{match.score}%</span>
          </div>
          <p className="mt-1 text-brand-900/80">{match.reason}</p>
        </div>
      )}

      <p className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-slate-700">Schools:</span>{" "}
        {driver.schools.length ? driver.schools.join(", ") : "—"}
      </p>

      <OccupancyBar
        occupancy={driver.occupancy}
        capacity={benchmarkCapacity(driver.vehicle_model, driver.official_capacity || driver.capacity)}
      />
    </Link>
  );
}
