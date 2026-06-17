import { capacityStatus } from "@/lib/utils";
import { Alert } from "./icons";

/**
 * Occupancy vs the OFFICIAL seating capacity (the safety benchmark).
 * Pass `capacity` = official_capacity so the limit cannot be manipulated.
 */
export default function OccupancyBar({
  occupancy,
  capacity,
}: {
  occupancy: number;
  capacity: number;
}) {
  const s = capacityStatus(occupancy, capacity);
  const seatsFree = Math.max(0, capacity - occupancy);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1 font-medium ${s.text}`}>
          {s.over && <Alert size={13} />}
          {s.label}
        </span>
        <span className="text-slate-500">
          {occupancy}/{capacity} seats
          {s.over ? "" : ` · ${seatsFree} free`}
        </span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${s.track}`}>
        <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
      </div>
    </div>
  );
}
