import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, FileVideoCamera, History, ImageIcon, Link as LinkIcon, LoaderCircle, ScrollText, Type } from "lucide-react";
import CheckChainLog from "@/components/CheckChainLog";
import VerdictBadge from "@/components/VerdictBadge";
import { LEDGER_LIMIT, LEDGER_TYPES, LEDGER_VERDICTS, parseLedgerFilters, toLedgerEntry, withSeenCounts, type LedgerFilters } from "@/lib/ledger";
import { claimClusterSizes, listChecks } from "@/lib/store";
import type { CheckResult, Verdict } from "@/lib/types";

export const metadata: Metadata = { title: "Public Fake-Claim Ledger · CrisisSignal" };

const VERDICT_LABEL: Record<Verdict, string> = {
  CONTRADICTED: "Contradicted",
  UNVERIFIED: "Unverified",
  SUPPORTED: "Supported",
  VERIFIED_OFFICIAL: "Verified official",
};
const TYPE: Record<CheckResult["inputType"], { label: string; icon: typeof Type }> = {
  text: { label: "Text", icon: Type },
  link: { label: "Link", icon: LinkIcon },
  image: { label: "Screenshot", icon: ImageIcon },
  video: { label: "Video", icon: FileVideoCamera },
};

export default function LedgerPage({ searchParams }: PageProps<"/ledger">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Public Fake-Claim Ledger</h1>
      <p className="mt-2 text-slate-300">
        Every claim people have checked, newest first, so you can see what&apos;s already been debunked. No names or emails are
        shown.
      </p>
      <Suspense
        fallback={
          <p className="mt-8 flex items-center gap-2 text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            Loading the ledger…
          </p>
        }
      >
        <Ledger searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Ledger({ searchParams }: { searchParams: PageProps<"/ledger">["searchParams"] }) {
  await connection();
  const filters = parseLedgerFilters(await searchParams);
  // Project to public entries here, on the server: the full check (with owner fields) never reaches the page.
  const projected = (await listChecks(filters)).map(toLedgerEntry);
  const sizes = await claimClusterSizes(projected.map((e) => e.claimId).filter((id): id is string => Boolean(id))).catch(() => new Map<string, number>());
  const entries = withSeenCounts(projected, sizes);

  return (
    <>
      <Filters filters={filters} />
      {entries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-navy-600 bg-navy-900 p-8 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 text-slate-200">No checks match these filters.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {entries.map((e) => {
            const { label, icon: Icon } = TYPE[e.inputType];
            return (
              <li key={e.id} className="rounded-xl border border-navy-700 bg-navy-900 hover:border-navy-600">
                <Link
                  href={`/result/${encodeURIComponent(e.id)}`}
                  className="flex items-center gap-4 rounded-xl p-4 hover:bg-navy-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                      <VerdictBadge verdict={e.verdict} compact />
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {label}
                      </span>
                      <span className="text-slate-600">·</span>
                      <time dateTime={e.createdAt} suppressHydrationWarning>
                        {new Date(e.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                      {e.seenCount && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1 text-slate-300">
                            <History className="h-3.5 w-3.5" aria-hidden />
                            seen {e.seenCount} times
                          </span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 break-words text-sm text-slate-200">{e.preview}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                </Link>
                {e.chainStatus === "confirmed" && (
                  <div className="border-t border-navy-700 px-4 py-3">
                    <CheckChainLog id={e.id} chainStatus={e.chainStatus} chainSignature={e.chainSignature} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {entries.length === LEDGER_LIMIT && <p className="mt-4 text-sm text-slate-400">Showing the latest {LEDGER_LIMIT}.</p>}
    </>
  );
}

function Filters({ filters }: { filters: LedgerFilters }) {
  const href = (next: LedgerFilters) => {
    const q = new URLSearchParams();
    if (next.verdict) q.set("verdict", next.verdict);
    if (next.type) q.set("type", next.type);
    const s = q.toString();
    return s ? `/ledger?${s}` : "/ledger";
  };
  return (
    <nav aria-label="Filter the ledger" className="mt-8 space-y-3">
      <FilterRow
        label="Verdict"
        options={[
          { text: "All", href: href({ ...filters, verdict: undefined }), active: !filters.verdict },
          ...LEDGER_VERDICTS.map((v) => ({ text: VERDICT_LABEL[v], href: href({ ...filters, verdict: v }), active: filters.verdict === v })),
        ]}
      />
      <FilterRow
        label="Type"
        options={[
          { text: "All", href: href({ ...filters, type: undefined }), active: !filters.type },
          ...LEDGER_TYPES.map((t) => ({ text: TYPE[t].label, href: href({ ...filters, type: t }), active: filters.type === t })),
        ]}
      />
    </nav>
  );
}

function FilterRow({ label, options }: { label: string; options: { text: string; href: string; active: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
      {options.map((o) => (
        <Link
          key={o.text}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            o.active ? "border-sky-500/60 bg-sky-500/15 text-sky-200" : "border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-slate-100"
          }`}
        >
          {o.text}
        </Link>
      ))}
    </div>
  );
}
