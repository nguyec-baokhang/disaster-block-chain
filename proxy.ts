// Runs Auth0's middleware on every route (mounts /auth/login, /auth/callback, /auth/logout and rolls
// the session), then sends logged-out visitors from /my-checks to login and non-admins away from
// /publish. Admin API routes check for themselves.
import { NextResponse, type NextRequest } from "next/server";
import { getProxyAdmin } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  const authRes = auth0 ? await auth0.middleware(request) : NextResponse.next();
  const { pathname } = request.nextUrl;

  // /my-checks needs any logged-in user, and doesn't exist without Auth0. Decided here because the
  // page streams, so by the time it could call notFound() the 200 status is already sent.
  if (pathname.startsWith("/my-checks")) {
    if (!auth0) return NextResponse.rewrite(new URL("/_my-checks-disabled", request.url)); // unmatched → 404
    if (!(await auth0.getSession(request))) {
      return withAuthCookies(NextResponse.redirect(new URL("/auth/login?returnTo=/my-checks", request.url)), authRes);
    }
  }
  if (!pathname.startsWith("/publish")) return authRes;
  if (await getProxyAdmin(request)) return authRes;

  return withAuthCookies(NextResponse.redirect(new URL("/admin/login", request.url)), authRes);
}

// Keep any session cookies Auth0 set on its response.
function withAuthCookies(redirect: NextResponse, authRes: NextResponse): NextResponse {
  for (const cookie of authRes.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
