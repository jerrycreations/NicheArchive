import { NextResponse, type NextRequest } from "next/server";
import { UNLOCK_PATH } from "@/lib/auth/next-path";
import { unauthorizedResponse } from "@/lib/auth/require-session";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// The first check: a signed-out device only reaches the unlock page. Server
// actions, route handlers and pages check again (lib/auth/require-session),
// because the proxy alone isn't enough. It checks only the cookie's
// signature, so it never waits on the database.

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return unauthorizedResponse();
  }

  const unlockUrl = new URL(UNLOCK_PATH, request.url);
  unlockUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(unlockUrl);
}

// The cron routes check CRON_SECRET themselves.
function isPublic(pathname: string) {
  return pathname === UNLOCK_PATH || pathname.startsWith("/api/cron/");
}

export const config = {
  matcher: [
    // Everything except build output, image optimization, the favicon,
    // robots.txt (crawlers must be able to read it) and image files.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
