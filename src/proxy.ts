import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "eth_session";
const PUBLIC_PATHS = ["/login"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Runs before every request:
 *  - Optimistic auth: pages without a session cookie go to /login. (The session itself is
 *    validated against the database in the app layout and in every API handler.)
 *  - CSRF: state-changing API calls must come from this origin. Together with the
 *    SameSite=Lax, HttpOnly session cookie this blocks cross-site form posts.
 *  - Security headers on every response.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/api/")) {
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (origin && host && new URL(origin).host !== host) {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      }
      if (!origin && req.headers.get("sec-fetch-site") === "cross-site") {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      }
    }
    return secure(NextResponse.next());
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  // /login itself decides whether an existing cookie is still a valid session; redirecting
  // here on cookie presence alone would loop when the cookie has expired server-side.
  return secure(NextResponse.next());
}

function secure(res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
