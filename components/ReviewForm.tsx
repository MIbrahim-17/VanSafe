"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewForm({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId, rating, comment }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not submit review.");
      return;
    }
    setComment("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h3 className="font-semibold text-slate-900">Leave a review</h3>
      <div>
        <span className="label">Rating</span>
        <div className="flex gap-1 text-2xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setRating(n)}
              className={n <= rating ? "text-amber-500" : "text-slate-300"}
              aria-label={`${n} stars`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Comment</label>
        <textarea
          className="input min-h-[80px]"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience for other parents…"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
