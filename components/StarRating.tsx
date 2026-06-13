import { Star } from "./icons";

export default function StarRating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "lg";
}) {
  const full = Math.round(value);
  const px = size === "lg" ? 18 : 14;
  const text = size === "lg" ? "text-base" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-1.5 ${text}`}>
      <span className="inline-flex" aria-label={`${value.toFixed(1)} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={px}
            filled={i < full}
            className={i < full ? "text-amber-400" : "text-slate-300"}
          />
        ))}
      </span>
      <span className="font-semibold text-slate-700">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-slate-400">({count})</span>}
    </span>
  );
}
