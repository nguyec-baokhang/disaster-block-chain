// Redirects logged-out visitors away from the admin page. Admin API routes check the cookie themselves.
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/publish/:path*"],
};
