"use client";

import { useState } from "react";
import { CircleCheck, CircleX, LoaderCircle, ShieldCheck } from "lucide-react";
import type { VerifyResult } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: VerifyResult }
  | { status: "error"; message: string };

export default function VerifyButton({ alertId }: { alertId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function verify() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/verify`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Verify failed (${res.status})`);
      setState({ status: "done", result: data as VerifyResult });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={verify}
        disabled={state.status === "loading"}
        className="inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-navy-700 disabled:opacity-60"
      >
        {state.status === "loading" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ShieldCheck className="h-4 w-4" aria-hidden />
        )}
        {state.status === "loading" ? "Verifying…" : "Verify integrity"}
      </button>

      {state.status === "error" && <p className="text-sm text-red-300">{state.message}</p>}
      {state.status === "done" && <VerifyOutcome result={state.result} />}
    </div>
  );
}

function VerifyOutcome({ result }: { result: VerifyResult }) {
  const intact = result.hashMatches && result.signerIsKnownAgency;
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${
        intact ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <p className={`flex items-center gap-2 font-semibold ${intact ? "text-emerald-300" : "text-red-300"}`}>
        {intact ? <CircleCheck className="h-5 w-5" aria-hidden /> : <CircleX className="h-5 w-5" aria-hidden />}
        {intact ? "Record intact" : "Record altered"}
      </p>
      {!intact && result.hashMatches && !result.signerIsKnownAgency && (
        <p className="mt-1 text-red-200">The on-chain signer is not the agency this alert claims to be from.</p>
      )}
      <dl className="mt-3 space-y-2 font-mono text-xs">
        <div>
          <dt className="text-slate-400">Stored alert hash</dt>
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
