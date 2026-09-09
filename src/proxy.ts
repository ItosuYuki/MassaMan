import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";
import { homePathForRole } from "@/lib/dal";

// Only /login is public; everything else that reaches this proxy requires a session.
// This is an optimistic (cookie-only) check — see src/lib/dal.ts for the per-route
// checks (verifySession/requireRole) that Server Components/Actions must also run.
const PUBLIC_ROUTES = ["/login"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (path === "/login" && session) {
    return NextResponse.redirect(new URL(homePathForRole(session.role), req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg)$).*)"],
};
