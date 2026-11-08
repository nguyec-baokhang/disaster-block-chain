import { Suspense } from "react";
import { connection } from "next/server";
import { LoaderCircle, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { getAuth0User } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";
import CheckForm from "./CheckForm";

export default function CheckPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-14 text-slate-300">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
          Loading…
        </p>
      }
    >
      <CheckGate />
    </Suspense>
  );
}

// Checking needs a login when Auth0 is configured (POST /api/check enforces the same rule).
async function CheckGate() {
  await connection();
  if (auth0 && !(await getAuth0User())?.sub) return <LoginToCheck />;
  return (
    <CheckForm
      loginNote={
        auth0 && (
          <p className="mt-2 text-sm text-slate-400">
            Your check will be added to the public Fake-Claim Ledger to protect others (your name and email are never shown) and
            saved to My checks so you can find it later.
          </p>
        )
      }
    />
  );
}

function LoginToCheck() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Log in to check a claim</h1>
      <p className="mt-2 text-slate-300">
        Checks are free. Each one is added to the public{" "}
        <a href="/ledger" className="text-sky-300 hover:text-sky-200 hover:underline">
          Fake-Claim Ledger
        </a>{" "}
        so others can see what&apos;s been debunked. Your email is never shown.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {/* Plain <a>: /auth/* routes are handled by the Auth0 proxy. */}
        <a
          href="/auth/login?returnTo=/check"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Log in
        </a>
        <a
          href="/auth/login?screen_hint=signup&returnTo=/check"
          className="inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-5 py-3 font-medium text-slate-100 hover:bg-navy-700"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Sign up
        </a>
      </div>
      <p className="mt-8 flex items-start gap-2 text-sm text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        You can still browse official alerts and past results without an account.
      </p>
    </div>
  );
}
