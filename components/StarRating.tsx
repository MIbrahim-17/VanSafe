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
  const cls = size === "lg" ? "text-xl" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(full)}
        <span className="text-slate-300">{"★".repeat(5 - full)}</span>
      </span>
      <span className="font-semibold text-slate-700">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-slate-400">({count})</span>
      )}
    </span>
  );
}
