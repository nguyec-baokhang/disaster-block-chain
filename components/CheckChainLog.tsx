"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Clock, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import ExplorerLink from "@/components/ExplorerLink";
import type { CheckVerifyResult } from "@/lib/check-log";
import { explorerUrl } from "@/lib/explorer";
import type { CheckResult } from "@/lib/types";

type Props = Pick<CheckResult, "id" | "chainStatus" | "chainSignature">;
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: CheckVerifyResult }
  | { status: "error"; message: string };

// "Logged on Solana" + explorer link + Verify (re-hash the stored check and compare with the memo).
export default function CheckChainLog({ id, chainStatus, chainSignature }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  if (chainStatus === "pending") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-slate-400">
        <Clock className="h-4 w-4" aria-hidden />
        Logging on Solana…
      </p>
    );
  }
  if (chainStatus !== "confirmed" || !chainSignature) return null;

  async function verify() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/checks/${encodeURIComponent(id)}/verify`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Verify failed (${res.status})`);
      setState({ status: "done", result: data as CheckVerifyResult });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
          <Link2 className="h-4 w-4" aria-hidden />
          Logged on Solana
        </span>
        <ExplorerLink url={explorerUrl(chainSignature)} />
        <button
          type="button"
          onClick={verify}
          disabled={state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-600 bg-navy-800 px-3 py-1 text-sm font-medium text-slate-100 hover:bg-navy-700 disabled:opacity-60"
        >
          {state.status === "loading" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
          {state.status === "loading" ? "Verifying…" : "Verify"}
        </button>
      </div>
      {state.status === "error" && <p className="text-sm text-red-300">{state.message}</p>}
      {state.status === "done" && <Outcome result={state.result} />}
    </div>
  );
}

function Outcome({ result }: { result: CheckVerifyResult }) {
  const intact = result.hashMatches && result.signerIsCheckLog;
  const heading = intact ? "Log entry intact" : result.onChainHash === null ? "No matching log entry found" : "Log entry doesn't match";
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${intact ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}
    >
      <p className={`flex items-center gap-2 font-semibold ${intact ? "text-emerald-300" : "text-red-300"}`}>
        {intact ? <CircleCheck className="h-5 w-5" aria-hidden /> : <CircleX className="h-5 w-5" aria-hidden />}
        {heading}
      </p>
      {intact && <p className="mt-1 text-emerald-100/80">This verdict hasn&apos;t been changed since it was logged.</p>}
      {result.hashMatches && !result.signerIsCheckLog && (
        <p className="mt-1 text-red-200">The memo wasn&apos;t signed by CrisisSignal&apos;s check-log wallet.</p>
      )}
      <dl className="mt-3 space-y-2 font-mono text-xs">
        <div>
          <dt className="text-slate-400">Stored check hash</dt>
          <dd className="break-all text-slate-200">{result.localHash}</dd>
        </div>
        <div>
          <dt className="text-slate-400">On-chain hash</dt>
          <dd className="break-all text-slate-200">{result.onChainHash ?? "Not found on-chain"}</dd>
        </div>
      </dl>
    </div>
  );
}
