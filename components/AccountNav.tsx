import Link from "next/link";
import { connection } from "next/server";
import { getAuth0User, isAdminUser } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";

const LINK = "rounded-md px-3 py-2 text-slate-300 hover:bg-navy-800 hover:text-slate-50";

// Optional login. Rendered per request (inside Suspense) so AUTH0_DOMAIN is read at runtime.
// /auth/* routes are served by the Auth0 proxy, so they use plain <a>, not <Link>.
export default async function AccountNav() {
  await connection();
  if (!auth0) return null;
  const user = await getAuth0User();

  if (!user) {
    return (
      <>
        <a href="/auth/login" className={LINK}>
          Log in
        </a>
        <a
          href="/auth/login?screen_hint=signup"
          className="rounded-md bg-sky-600 px-3 py-2 font-medium text-white hover:bg-sky-500"
        >
          Sign up
        </a>
      </>
    );
  }

  return (
    <>
      {isAdminUser(user) && (
        <Link href="/publish" className={LINK}>
          Admin
        </Link>
      )}
      <Link href="/my-checks" className={LINK}>
        My checks
      </Link>
      {user.email && <span className="hidden max-w-48 truncate px-2 text-slate-400 md:inline">{user.email}</span>}
      <a href="/auth/logout" className={LINK}>
        Log out
      </a>
    </>
  );
}
