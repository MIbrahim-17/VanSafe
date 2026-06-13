import StarRating from "./StarRating";
import type { Review } from "@/lib/types";

export default function ReviewList({
  reviews,
  names,
}: {
  reviews: Review[];
  names: Record<string, string>;
}) {
  if (!reviews.length) {
    return <p className="text-sm text-slate-500">No reviews yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="card p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              {names[r.parent_id] ?? "Parent"}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(r.created_at).toLocaleDateString()}
            </span>
          </div>
          <StarRating value={r.rating} />
          {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
