import { capacityStatus } from "@/lib/utils";
import { Alert } from "./icons";

/**
 * Compact colour-coded capacity badge for driver cards.
 * Green < 70% · amber 70–90% · red 90–100% · dark red + warning if over the
 * official limit. Pass `capacity` = official_capacity (the safety benchmark).
 */
export default function CapacityBadge({
  occupancy,
  capacity,
}: {
  occupancy: number;
  capacity: number;
}) {
  const s = capacityStatus(occupancy, capacity);
  return (
    <span className={`badge ${s.badge}`} title={s.label}>
      {s.over ? (
        <>
          <Alert size={12} /> Over capacity
        </>
      ) : (
        `${occupancy}/${capacity} seats`
      )}
    </span>
  );
}
