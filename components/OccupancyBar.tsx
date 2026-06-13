import { occupancyColor } from "@/lib/utils";

export default function OccupancyBar({
  occupancy,
  capacity,
}: {
  occupancy: number;
  capacity: number;
}) {
  const { bar, text, label } = occupancyColor(occupancy, capacity);
  const pct = capacity > 0 ? Math.min(100, (occupancy / capacity) * 100) : 100;
  const seatsFree = Math.max(0, capacity - occupancy);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`font-medium ${text}`}>{label}</span>
        <span className="text-slate-500">
          {occupancy}/{capacity} seats · {seatsFree} free
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
