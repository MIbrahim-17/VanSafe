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
import { MapPin, Sparkles, Message } from "@/components/icons";
import { whatsappLink } from "@/lib/utils";
import { cityLabel } from "@/lib/constants";
import { benchmarkCapacity, CATEGORY_URDU } from "@/lib/vehicles";
import type { Child, Driver, Profile, Review, VehicleType } from "@/lib/types";

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
  // Safety benchmark = official catalog capacity (falls back to entered seats).
  const benchmark = benchmarkCapacity(d.vehicle_model, d.official_capacity || d.capacity);

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

  // Parent's children + whether any is linked to this driver.
  const isParent = viewer?.role === "parent";
  let myChildren: Child[] = [];
  if (isParent) {
    const { data: kids } = await supabase
      .from("children")
      .select("*")
      .eq("parent_id", viewer!.id)
      .order("created_at");
    myChildren = (kids as Child[] | null) ?? [];
  }
  const linkedHere = myChildren.some((c) => c.driver_id === params.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{driverProfile.name}</h1>
              <p className="mt-1">
                <span className="badge bg-brand-100 text-brand-800">
                  <MapPin size={13} /> {driverProfile.city ? cityLabel(driverProfile.city) : "City not set"}
                </span>
              </p>
              {d.areas?.length > 0 && (
                <p className="mt-1 text-sm text-slate-500">Areas: {d.areas.join(", ")}</p>
              )}
            </div>
            <StarRating value={d.rating} count={d.review_count} size="lg" />
          </div>
          {d.bio && <p className="mt-3 text-sm text-slate-600">{d.bio}</p>}

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold text-slate-900">
                {d.make_model || d.vehicle_model || "Vehicle"}
                {benchmark > 0 && (
                  <span className="font-normal text-slate-500"> — {benchmark} seats</span>
                )}
              </p>
              <span className="badge bg-white text-slate-600 ring-1 ring-slate-200">
                {d.vehicle_type}
                {CATEGORY_URDU[d.vehicle_type as VehicleType]
                  ? ` · ${CATEGORY_URDU[d.vehicle_type as VehicleType]}`
                  : ""}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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
                <p className="text-xs text-slate-400">Official capacity</p>
                <p className="font-medium text-slate-700">{benchmark} seats</p>
              </div>
            </div>
            {d.capacity > 0 && d.capacity !== benchmark && (
              <p className="mt-2 text-xs text-slate-400">
                Driver states {d.capacity} seats (modified) — safety checks use the official limit
                of {benchmark}.
              </p>
            )}
          </div>
          <div className="mt-3">
            <TrustBadges driver={d} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Schools served:</span>{" "}
            {d.schools.length ? d.schools.join(", ") : "—"}
          </p>
        </div>

        <div className="card border-brand-100 bg-brand-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-900">
            <Sparkles size={18} /> AI review summary
          </h2>
          <p className="mt-2 text-sm text-brand-900/80">{summary}</p>
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
          <OccupancyBar occupancy={d.occupancy} capacity={benchmark} />
        </div>

        {isParent ? (
          <div className="card p-4">
            <LinkButton driverId={params.id} kids={myChildren} />
            <a
              className="btn-green mt-2 w-full"
              href={whatsappLink(driverProfile.whatsapp)}
              target="_blank"
              rel="noreferrer"
            >
              <Message size={16} /> WhatsApp driver
            </a>
          </div>
        ) : (
          <div className="card p-4 text-sm text-slate-500">
            <Link href="/login" className="text-brand-700">Log in as a parent</Link> to link
            your child to this van.
          </div>
        )}
      </aside>
    </div>
  );
}
