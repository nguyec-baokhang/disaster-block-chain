// Runs Auth0's middleware on every route (mounts /auth/login, /auth/callback, /auth/logout and rolls
// the session), then redirects non-admins away from /publish. Admin API routes check for themselves.
import { NextResponse, type NextRequest } from "next/server";
import { getProxyAdmin } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  const authRes = auth0 ? await auth0.middleware(request) : NextResponse.next();
  if (!request.nextUrl.pathname.startsWith("/publish")) return authRes;
  if (await getProxyAdmin(request)) return authRes;

  const redirect = NextResponse.redirect(new URL("/admin/login", request.url));
  // Keep any session cookies Auth0 set on this response.
  for (const cookie of authRes.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
