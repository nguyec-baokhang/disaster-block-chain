// Server-only: who is an admin. Accepts an Auth0 session whose verified email is in ADMIN_EMAILS,
// or the password cookie from lib/admin.ts.
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminRequest, verifySessionToken } from "./admin";
import { auth0 } from "./auth0";

export type Admin = { method: "auth0"; email: string } | { method: "password" };
export type Auth0User = { email?: string; email_verified?: boolean };

export function adminEmails(raw = process.env.ADMIN_EMAILS ?? ""): string[] {
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Unverified emails don't count: anyone can sign up with someone else's address.
export function isAdminUser(user: Auth0User | null | undefined, raw?: string): boolean {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && user?.email_verified === true && adminEmails(raw).includes(email));
}

function resolve(user: Auth0User | null, passwordOk: boolean): Admin | null {
  if (user && isAdminUser(user)) return { method: "auth0", email: user.email! };
  return passwordOk ? { method: "password" } : null;
}

// The signed-in Auth0 user, admin or not. Null when Auth0 is off or nobody is signed in.
export async function getAuth0User(request?: NextRequest): Promise<Auth0User | null> {
  if (!auth0) return null;
  try {
    const session = request ? await auth0.getSession(request) : await auth0.getSession();
    return (session?.user as Auth0User | undefined) ?? null;
  } catch (err) {
    console.error("auth0 getSession failed:", err);
    return null;
  }
}

// Server components and server actions.
export async function getAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return resolve(await getAuth0User(), verifySessionToken(token));
}

// proxy.ts: reads the session from the request, before rendering.
export async function getProxyAdmin(request: NextRequest): Promise<Admin | null> {
  return resolve(await getAuth0User(request), verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value));
}

// For admin route handlers: returns a 401 response to send, or null when the caller is an admin.
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (isAdminRequest(request)) return null;
  if (isAdminUser(await getAuth0User())) return null;
  return Response.json({ error: "Admin login required" }, { status: 401 });
}
