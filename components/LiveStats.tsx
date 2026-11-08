import { Activity } from "lucide-react";
import type { CheckStats } from "@/lib/store";
import type { Verdict } from "@/lib/types";

const TILES: { verdict: Verdict; label: string; className: string }[] = [
  { verdict: "VERIFIED_OFFICIAL", label: "Verified official", className: "text-emerald-300" },
  { verdict: "CONTRADICTED", label: "Contradicted", className: "text-red-300" },
  { verdict: "SUPPORTED", label: "Supported by sources", className: "text-sky-300" },
  { verdict: "UNVERIFIED", label: "Unverified", className: "text-amber-300" },
];

export default function LiveStats({ stats }: { stats: CheckStats }) {
  const last24h = stats.hourly.reduce((n, h) => n + h.count, 0);

  return (
    <section aria-labelledby="live-stats" className="mt-8 rounded-xl border border-navy-700 bg-navy-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="live-stats" className="flex items-center gap-2 font-medium text-slate-50">
          <Activity className="h-4 w-4 text-sky-400" aria-hidden />
          Live stats
        </h2>
        <p className="text-sm text-slate-400">{last24h} in the last 24 hours</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg bg-navy-800 px-3 py-2">
          <dt className="text-xs text-slate-400">Total checks</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">{stats.total}</dd>
        </div>
        {TILES.map(({ verdict, label, className }) => (
          <div key={verdict} className="rounded-lg bg-navy-800 px-3 py-2">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${className}`}>{stats.byVerdict[verdict] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
