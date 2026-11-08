import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ChevronRight, History, LoaderCircle } from "lucide-react";
import VerdictBadge from "@/components/VerdictBadge";
import { getAuth0User } from "@/lib/admin-auth";
import { auth0 } from "@/lib/auth0";
import { listChecksByUser } from "@/lib/store";

export default function MyChecksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">My checks</h1>
      <p className="mt-2 text-slate-300">Your own checks. Each one is also on the public Ledger anonymously — only you can see that you made it.</p>
      <Suspense
        fallback={
          <p className="mt-8 flex items-center gap-2 text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            Loading your checks…
          </p>
        }
      >
        <CheckList />
      </Suspense>
    </div>
  );
}

async function CheckList() {
  await connection();
  if (!auth0) notFound();
  const user = await getAuth0User();
  // proxy.ts redirects first; this covers anything that slips past it.
  if (!user?.sub) redirect("/auth/login?returnTo=/my-checks");

  const checks = await listChecksByUser(user.sub);
  if (checks.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-navy-600 bg-navy-900 p-8 text-center">
        <History className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
        <p className="mt-3 text-slate-200">No checks yet.</p>
        <Link href="/check" className="mt-2 inline-block text-sky-300 hover:text-sky-200 hover:underline">
          Check a message
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 space-y-3">
      {checks.map((c) => (
        <li key={c.id}>
          <Link
            href={`/result/${encodeURIComponent(c.id)}`}
            className="flex items-center gap-4 rounded-xl border border-navy-700 bg-navy-900 p-4 hover:border-navy-600 hover:bg-navy-800"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={c.verdict} compact />
                <span className="text-sm text-slate-400">
                  <time dateTime={c.createdAt} suppressHydrationWarning>
                    {new Date(c.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  <span className="text-slate-600"> · </span>
                  <span className="font-mono">{c.id}</span>
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                {{ text: "", link: "Link: ", image: "Screenshot: ", video: "Video: " }[c.inputType]}
                {c.inputType === "link" ? (c.sourceTitle ?? c.sourceUrl) : (c.inputText ?? c.extractedText ?? c.inputTranscript ?? c.summary)}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
