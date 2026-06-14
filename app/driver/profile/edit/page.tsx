import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProfileEditForm from "@/components/ProfileEditForm";
import type { Driver } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const profile = await requireRole("driver");
  const supabase = createClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", profile.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <h1 className="text-title1 text-slate-900">Edit your profile</h1>
      <p className="text-sm text-slate-500">
        Keep this accurate — it&apos;s what parents see when choosing a van.
      </p>
      <ProfileEditForm profile={profile} driver={driver as Driver} />
    </div>
  );
}
