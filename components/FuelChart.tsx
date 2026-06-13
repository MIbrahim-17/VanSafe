/**
 * FuelChart — lightweight, dependency-free SVG bar chart of daily fuel cost
 * over the last 30 days (green portion = what optimization saved that day).
 */
export interface FuelDay {
  date: string; // YYYY-MM-DD
  cost: number; // optimized fuel cost (PKR)
  saved: number; // saved vs unoptimized (PKR)
}

export default function FuelChart({ data }: { data: FuelDay[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No route history yet — optimize a route to start tracking your savings.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.cost + d.saved), 1);
  const W = 100 / data.length;

  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-36 w-full">
        {data.map((d, i) => {
          const total = d.cost + d.saved;
          const h = (total / max) * 38;
          const savedH = (d.saved / max) * 38;
          const x = i * W;
          return (
            <g key={d.date}>
              {/* unoptimized-equivalent total (slate) */}
              <rect x={x + W * 0.15} y={40 - h} width={W * 0.7} height={h} fill="#e2e8f0" rx="0.3" />
              {/* the portion saved (green), stacked on top */}
              <rect x={x + W * 0.15} y={40 - h} width={W * 0.7} height={savedH} fill="#138f4e" rx="0.3" />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{label(data[0].date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-slate-300" /> daily cost
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-brand-600" /> saved
          </span>
        </span>
        <span>{label(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

function label(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
