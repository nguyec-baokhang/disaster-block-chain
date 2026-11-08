"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, RotateCcw } from "lucide-react";
import ExplorerLink from "@/components/ExplorerLink";
import type { Alert } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; alert: Alert }
  | { status: "error"; message: string };

export default function RetryButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  async function retry() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/retry`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Retry failed (${res.status})`);
      const alert = data as Alert;
      if (alert.chainStatus !== "confirmed") throw new Error("The Solana transaction failed again. Check the wallet's Devnet SOL balance.");
      setState({ status: "done", alert });
      router.refresh();
    } catch (err) {
      setState({ status: "error", message: err instanceof TypeError ? "Couldn't reach the server. Please try again." : (err as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <CircleCheck className="h-4 w-4" aria-hidden />
          Signed on Solana
        </span>
        {state.alert.explorerUrl && <ExplorerLink url={state.alert.explorerUrl} />}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={retry}
        disabled={state.status === "loading"}
        className="inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-navy-700 disabled:cursor-wait disabled:opacity-60"
      >
        {state.status === "loading" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="h-4 w-4" aria-hidden />
        )}
        {state.status === "loading" ? "Signing on Solana…" : "Retry on Solana"}
      </button>
      {state.status === "error" && <p className="text-sm text-red-300">{state.message}</p>}
    </div>
  );
}
