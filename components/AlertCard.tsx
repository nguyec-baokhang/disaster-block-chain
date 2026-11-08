import { CircleX, Clock, Link2 } from "lucide-react";
import ExplorerLink from "@/components/ExplorerLink";
import RetryButton from "@/components/RetryButton";
import SourceUrlLink from "@/components/SourceUrlLink";
import VerifyButton from "@/components/VerifyButton";
import type { Alert } from "@/lib/types";

const CHAIN_STATUS: Record<Alert["chainStatus"], { label: string; icon: typeof Link2; className: string }> = {
  confirmed: { label: "Signed on Solana", icon: Link2, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  pending: { label: "Pending on Solana", icon: Clock, className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  failed: { label: "Not recorded on-chain", icon: CircleX, className: "border-red-500/40 bg-red-500/10 text-red-300" },
};

export default function AlertCard({ alert, preview = true }: { alert: Alert; preview?: boolean }) {
  const status = CHAIN_STATUS[alert.chainStatus];
  const StatusIcon = status.icon;
  const recorded = alert.chainStatus === "confirmed" && alert.signature;

  return (
    <article className="rounded-xl border border-navy-700 bg-navy-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">{alert.agencyName}</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden />
          {status.label}
        </span>
      </div>

      <h3 className="mt-2 text-lg font-semibold text-slate-50">{alert.title}</h3>
      <p className={`mt-1 whitespace-pre-wrap text-slate-300 ${preview ? "line-clamp-3" : ""}`}>{alert.body}</p>

      <p className="mt-3 text-sm text-slate-400">
        <time dateTime={alert.issuedAt}>
          {new Date(alert.issuedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </time>
        <span className="text-slate-600"> · </span>
        <span className="font-mono">{alert.id}</span>
      </p>
      {alert.sourceUrl && (
        <p className="mt-1">
          <SourceUrlLink url={alert.sourceUrl} />
        </p>
      )}

      {recorded ? (
        <div className="mt-4 space-y-3 border-t border-navy-700 pt-4">
          {alert.explorerUrl && <ExplorerLink url={alert.explorerUrl} />}
          <VerifyButton alertId={alert.id} />
        </div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-navy-700 pt-4">
          <p className="text-sm text-slate-400">
            This alert has no confirmed Solana transaction, so it can&apos;t be verified and isn&apos;t used for checks.
          </p>
          {alert.chainStatus === "failed" && <RetryButton alertId={alert.id} />}
        </div>
      )}
    </article>
  );
}
