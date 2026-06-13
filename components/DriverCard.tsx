import Link from "next/link";
import StarRating from "./StarRating";
import OccupancyBar from "./OccupancyBar";
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
      className="card block p-4 transition hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{driver.profile.name}</h3>
            {driver.verified && (
              <span className="badge bg-indigo-100 text-indigo-700">✔ Verified</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            📍 {driver.profile.city || "—"}
            {driver.area ? ` · ${driver.area}` : ""} · {driver.vehicle_type}
          </p>
        </div>
        <StarRating value={driver.rating} count={driver.review_count} />
      </div>

      {match && (
        <div className="mb-3 rounded-xl bg-indigo-50 p-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-indigo-700">AI match</span>
            <span className="badge bg-indigo-600 text-white">{match.score}%</span>
          </div>
          <p className="mt-1 text-indigo-900/80">{match.reason}</p>
        </div>
      )}

      <p className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-slate-700">Schools:</span>{" "}
        {driver.schools.length ? driver.schools.join(", ") : "—"}
      </p>

      <OccupancyBar occupancy={driver.occupancy} capacity={driver.capacity} />
    </Link>
  );
}
