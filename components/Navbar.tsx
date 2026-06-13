import Link from "next/link";
import { getProfile } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function Navbar() {
  const profile = await getProfile();
  const home = profile
    ? profile.role === "driver"
      ? "/driver/dashboard"
      : "/parent/dashboard"
    : "/";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href={home} className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
            🚐
          </span>
          VanSafe
        </Link>

        <nav className="flex items-center gap-2">
          {profile ? (
            <>
              {profile.role === "parent" && (
                <>
                  <Link href="/parent/browse" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">
                    Browse
                  </Link>
                  <Link href="/parent/match" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">
                    AI Match
                  </Link>
                </>
              )}
              {profile.role === "driver" && (
                <Link href="/driver/track" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">
                  Tracking
                </Link>
              )}
              <span className="hidden text-sm text-slate-400 sm:block">
                {profile.name}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
