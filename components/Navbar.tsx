import Link from "next/link";
import { getProfile } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import { Bus } from "./icons";

// Animated-underline nav link (grows from the left on hover).
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative hidden px-1 py-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:block"
    >
      {children}
      <span className="absolute inset-x-1 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-brand-600 transition-transform duration-300 ease-out group-hover:scale-x-100" />
    </Link>
  );
}

export default async function Navbar() {
  const profile = await getProfile();
  const home = profile
    ? profile.role === "driver"
      ? "/driver/dashboard"
      : "/parent/dashboard"
    : "/";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href={home} className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white shadow-sm transition-transform duration-300 group-hover:scale-105">
            <Bus size={20} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-slate-900">
              VanSafe
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              School Transport Safety
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {profile ? (
            <>
              {profile.role === "parent" && (
                <>
                  <NavLink href="/parent/browse">Browse</NavLink>
                  <NavLink href="/parent/match">AI Match</NavLink>
                </>
              )}
              {profile.role === "driver" && (
                <>
                  <NavLink href="/driver/route">Route</NavLink>
                  <NavLink href="/driver/track">Tracking</NavLink>
                </>
              )}
              <span className="mr-1 hidden items-center gap-2 border-l border-slate-200 pl-4 text-sm text-slate-500 sm:flex">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
                {profile.name}
              </span>
              <LogoutButton />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn-ghost">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
