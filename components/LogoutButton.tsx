"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "./icons";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="btn-ghost" aria-label="Log out">
      <LogOut size={16} />
      <span className="hidden sm:inline">Log out</span>
    </button>
  );
}
