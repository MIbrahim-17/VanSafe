import { requireRole } from "@/lib/auth";
import ParentProfileForm from "@/components/ParentProfileForm";

export const dynamic = "force-dynamic";

export default async function ParentProfileEditPage() {
  const profile = await requireRole("parent");
  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <h1 className="text-title1 text-slate-900">Edit your profile</h1>
      <p className="text-sm text-slate-500">Update your details and city.</p>
      <ParentProfileForm profile={profile} />
    </div>
  );
}
