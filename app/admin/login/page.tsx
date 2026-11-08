import { Suspense } from "react";
import { connection } from "next/server";
import { CircleX, KeyRound } from "lucide-react";
import { getAuth0User, isAdminUser } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";
import LoginForm from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Admin login</h1>
      <p className="mt-2 text-slate-300">Adding and mirroring alerts is limited to admins.</p>
      <Suspense fallback={null}>
        <Auth0Login />
      </Suspense>
      <LoginForm />
    </div>
  );
}

// Rendered per request so AUTH0_DOMAIN is read at runtime, not frozen into the prerender.
async function Auth0Login() {
  await connection();
  if (!auth0) return null;
  return (
    <>
      <NotAdminNotice />
      {/* A plain <a>: /auth/* routes are handled by the Auth0 proxy, not the app router. */}
      <a
        href="/auth/login?returnTo=/publish"
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500"
      >
        <KeyRound className="h-4 w-4" aria-hidden />
        Log in with Auth0
      </a>
      <p className="mt-8 text-sm text-slate-400">Or use the admin password:</p>
    </>
  );
}

// Shown when someone signed in with Auth0 but isn't on ADMIN_EMAILS (the proxy sent them back here).
async function NotAdminNotice() {
  const user = await getAuth0User();
  if (!user || isAdminUser(user)) return null;
  const reason =
    user.email && user.email_verified !== true
      ? `${user.email} hasn't been verified yet. Verify it with Auth0, then log in again.`
      : `${user.email ?? "This account"} isn't on the admin list.`;
  return (
    <div role="alert" className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      <p className="flex items-start gap-2 font-medium">
        <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Not an admin
      </p>
      <p className="mt-1 pl-6">{reason}</p>
      <a href="/auth/logout" className="mt-2 inline-block pl-6 text-red-100 underline hover:text-white">
        Log out of Auth0
      </a>
    </div>
  );
}
