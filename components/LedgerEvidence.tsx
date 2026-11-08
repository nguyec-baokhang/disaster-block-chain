"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, History, Link2 } from "lucide-react";
import VerdictBadge from "@/components/VerdictBadge";
import type { LedgerEvidenceView } from "@/lib/evidence";
import type { CheckResult, Verdict } from "@/lib/types";

const VERDICT_WORD: Record<Verdict, string> = {
  CONTRADICTED: "Contradicted",
  VERIFIED_OFFICIAL: "Verified official",
  SUPPORTED: "Supported by sources",
  UNVERIFIED: "Unverified",
};
const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });

// "Evidence from the ledger": earlier checks of the same file or a similar claim. Shown only when there are any.
export default function LedgerEvidence({ check }: { check: CheckResult }) {
  const [view, setView] = useState<LedgerEvidenceView | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    // A brand-new check's embedding is saved just after the response, so retry briefly if it's not there yet.
    const fresh = Date.now() - Date.parse(check.createdAt) < 60_000;
    async function load() {
      const res = await fetch(`/api/checks/${encodeURIComponent(check.id)}/evidence`, { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as LedgerEvidenceView | null) : null;
      if (cancelled) return;
      if (data && (data.media || data.similar)) return setView(data);
      if (fresh && ++tries < 4) setTimeout(load, 2500);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [check.id, check.createdAt]);

  if (!view || (!view.media && !view.similar)) return null;
  const kind = check.inputType === "video" ? "video" : "screenshot";

  return (
    <section aria-labelledby="ledger-evidence">
      <h2 id="ledger-evidence" className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-400">
        Evidence from the ledger
      </h2>
      <div className="rounded-xl border border-navy-700 bg-navy-900 p-5">
        <div className="space-y-1 text-slate-200">
          {view.media && (
            <p className="flex items-start gap-2">
              <History className="mt-1 h-4 w-4 shrink-0 text-sky-400" aria-hidden />
              This exact {kind} was checked {times(view.media.count)} before, first on {day(view.media.firstSeen)}.
            </p>
          )}
          {view.similar && (
            <p className="flex items-start gap-2">
              <History className="mt-1 h-4 w-4 shrink-0 text-sky-400" aria-hidden />
              Similar claims checked {times(view.similar.count)} since {day(view.similar.firstSeen)} · most common verdict{" "}
              {VERDICT_WORD[view.similar.commonVerdict]}
            </p>
          )}
        </div>

        {view.top.length > 0 && (
          <ul className="mt-4 divide-y divide-navy-700 border-t border-navy-700">
            {view.top.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <Link href={`/result/${encodeURIComponent(r.id)}`} className="font-mono text-sm text-sky-300 hover:text-sky-200 hover:underline">
                  {r.id}
                </Link>
                <span className="text-sm tabular-nums text-slate-400">
                  {r.via === "media" ? "Same file" : `${Math.round(r.similarity * 100)}% similar`}
                </span>
                <VerdictBadge verdict={r.verdict} compact />
                {r.logged && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    Logged on Solana
                  </span>
                )}
                {r.trusted && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-200">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Verified evidence
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Past checks are context only. The verdict above still comes from official alerts or cited sources.
        </p>
      </div>
    </section>
  );
}
