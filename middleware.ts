import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/parent", "/driver", "/dashboard"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path.startsWith(p));

  // Not logged in but trying to reach a protected page -> login.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const role = (user.user_metadata?.role as string) ?? "parent";

    // Bare /dashboard -> role home.
    if (path === "/dashboard") {
      const url = request.nextUrl.clone();
      url.pathname = role === "driver" ? "/driver/dashboard" : "/parent/dashboard";
      return NextResponse.redirect(url);
    }

    // Keep users inside their own area.
    if (role === "parent" && path.startsWith("/driver/") && !isPublicDriverPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/parent/dashboard";
      return NextResponse.redirect(url);
    }
    if (role === "driver" && path.startsWith("/parent")) {
      const url = request.nextUrl.clone();
      url.pathname = "/driver/dashboard";
      return NextResponse.redirect(url);
    }

    // Logged-in users skip the auth pages.
    if (path === "/login" || path === "/register") {
      const url = request.nextUrl.clone();
      url.pathname = role === "driver" ? "/driver/dashboard" : "/parent/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

/** /driver/[id] public profile pages are viewable by parents. */
function isPublicDriverPath(path: string) {
  return /^\/driver\/[0-9a-fA-F-]{6,}$/.test(path);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
