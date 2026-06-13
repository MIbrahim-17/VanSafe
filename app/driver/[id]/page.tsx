import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { summarizeReviews } from "@/lib/gemini";
import StarRating from "@/components/StarRating";
import OccupancyBar from "@/components/OccupancyBar";
import TrustBadges from "@/components/TrustBadges";
import ReviewList from "@/components/ReviewList";
import ReviewForm from "@/components/ReviewForm";
import LinkButton from "@/components/LinkButton";
import { whatsappLink } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import type { Driver, LinkRow, Profile, Review } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const viewer = await getProfile();

  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!driver) notFound();
  const d = driver as Driver;

  const { data: dProfile } = await supabase
    .from("profiles")
    .select("name,whatsapp,city")
    .eq("id", params.id)
    .single();
  const driverProfile = dProfile as Pick<Profile, "name" | "whatsapp" | "city">;

  const { data: reviewsData } = await supabase
    .from("reviews")
    .select("*")
    .eq("driver_id", params.id)
    .order("created_at", { ascending: false });
  const reviews = (reviewsData as Review[] | null) ?? [];

  // Reviewer names.
  const reviewerIds = Array.from(new Set(reviews.map((r) => r.parent_id)));
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("profiles").select("id,name").in("id", reviewerIds)
    : { data: [] };
  const names: Record<string, string> = {};
  (reviewers as Pick<Profile, "id" | "name">[] | null)?.forEach((p) => {
    names[p.id] = p.name;
  });

  const summary = await summarizeReviews(reviews);

  // Parent link status.
  let linkedHere = false;
  let linkedElsewhere = false;
  const isParent = viewer?.role === "parent";
  if (isParent) {
    const { data: myLink } = await supabase
      .from("links")
      .select("*")
      .eq("parent_id", viewer!.id)
      .maybeSingle();
    const link = myLink as LinkRow | null;
    linkedHere = link?.driver_id === params.id;
    linkedElsewhere = !!link && link.driver_id !== params.id;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{driverProfile.name}</h1>
              <p className="mt-1">
                <span className="badge bg-indigo-100 text-indigo-700">
                  📍 {driverProfile.city ? cityLabel(driverProfile.city) : "City not set"}
                </span>
              </p>
              {d.area && <p className="mt-1 text-sm text-slate-500">{d.area}</p>}
            </div>
            <StarRating value={d.rating} count={d.review_count} size="lg" />
          </div>
          {d.bio && <p className="mt-3 text-sm text-slate-600">{d.bio}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Vehicle</p>
              <p className="font-medium text-slate-700">
                {d.make_model || d.vehicle_type}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Type</p>
              <p className="font-medium text-slate-700">{d.vehicle_type}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Colour</p>
              <p className="font-medium text-slate-700">{d.color || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Plate</p>
              <p className="font-medium text-slate-700">{d.plate || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Year</p>
              <p className="font-medium text-slate-700">{d.year ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Capacity</p>
              <p className="font-medium text-slate-700">{d.capacity} seats</p>
            </div>
          </div>
          <div className="mt-3">
            <TrustBadges driver={d} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Schools served:</span>{" "}
            {d.schools.length ? d.schools.join(", ") : "—"}
          </p>
        </div>

        <div className="card border-indigo-100 bg-indigo-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-indigo-800">
            🤖 AI review summary
          </h2>
          <p className="mt-2 text-sm text-indigo-900/80">{summary}</p>
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-slate-900">
            Reviews ({reviews.length})
          </h2>
          <ReviewList reviews={reviews} names={names} />
        </div>

        {isParent && linkedHere && (
          <ReviewForm driverId={params.id} />
        )}
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Seat availability</p>
          <OccupancyBar occupancy={d.occupancy} capacity={d.capacity} />
        </div>

        {isParent ? (
          <div className="card p-4">
            <LinkButton
              driverId={params.id}
              linkedHere={linkedHere}
              linkedElsewhere={linkedElsewhere}
            />
            <a
              className="btn-green mt-2 w-full"
              href={whatsappLink(driverProfile.whatsapp)}
              target="_blank"
              rel="noreferrer"
            >
              💬 WhatsApp driver
            </a>
          </div>
        ) : (
          <div className="card p-4 text-sm text-slate-500">
            <Link href="/login" className="text-indigo-600">Log in as a parent</Link> to link
            your child to this van.
          </div>
        )}
      </aside>
    </div>
  );
}
