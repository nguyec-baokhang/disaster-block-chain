import { Suspense } from "react";
import { connection } from "next/server";
import { getAuth0User } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";
import CheckForm from "./CheckForm";

export default function CheckPage() {
  return (
    <CheckForm
      loginNote={
        <Suspense fallback={null}>
          <LoginNote />
        </Suspense>
      }
    />
  );
}

async function LoginNote() {
  await connection();
  if (!auth0) return null;
  const user = await getAuth0User();
  return (
    <p className="mt-2 text-sm text-slate-400">
      {user ? (
        <>
          You&apos;re logged in, so this check will be saved to{" "}
          <a href="/my-checks" className="text-slate-300 underline hover:text-slate-100">
            My checks
          </a>
          .
        </>
      ) : (
        <>
          Checking is free and anonymous.{" "}
          <a href="/auth/login?returnTo=/check" className="text-slate-300 underline hover:text-slate-100">
            Log in
          </a>{" "}
          to save your history.
        </>
      )}
    </p>
  );
}
