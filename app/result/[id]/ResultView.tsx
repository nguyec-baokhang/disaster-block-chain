"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Flag, Info, Link2, LoaderCircle, RotateCcw } from "lucide-react";
import DiffList from "@/components/DiffList";
import ExplorerLink from "@/components/ExplorerLink";
import SourceList from "@/components/SourceList";
import VerdictBadge from "@/components/VerdictBadge";
import VerifyButton from "@/components/VerifyButton";
import type { Alert, CheckResult } from "@/lib/types";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "done"; check: CheckResult };

export default function ResultView() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/checks/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(res.status === 404 ? "We couldn't find that result." : (data?.error ?? `Error ${res.status}`));
        if (!cancelled) setState({ status: "done", check: data as CheckResult });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-14 text-slate-300">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        Loading result…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-14">
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
          {state.message}
        </p>
        <CheckAnother />
      </div>
    );
  }

  const { check } = state;
  const seen = check.inputText ?? check.inputTranscript ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:py-14">
      <section className="space-y-4">
        <VerdictBadge verdict={check.verdict} />
        {check.summary && <p className="max-w-3xl text-lg text-slate-200">{check.summary}</p>}
      </section>

      {check.matchedAlert ? (
        <>
          <section aria-label="Comparison" className="grid gap-4 md:grid-cols-2">
            <Panel title={check.inputType === "video" ? "What you saw (transcript)" : "What you saw"}>
              <p className="whitespace-pre-wrap text-slate-200">{seen}</p>
            </Panel>
            <OfficialPanel alert={check.matchedAlert} />
          </section>

          {check.differences.length > 0 && (
            <Section title="What changed">
              <DiffList differences={check.differences} />
            </Section>
          )}
        </>
      ) : (
        <Panel title={check.inputType === "video" ? "What you checked (transcript)" : "What you checked"}>
          <p className="whitespace-pre-wrap text-slate-200">{seen}</p>
        </Panel>
      )}

      {check.redFlags.length > 0 && (
        <Section title="Red flags">
          <ul className="space-y-2">
            {check.redFlags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-200">
                <Flag className="mt-1 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!check.matchedAlert && (
        <Section title="Sources">
          <SourceList sources={check.sources} />
        </Section>
      )}

      {check.limitations.length > 0 && (
        <Section title="Limitations">
          <ul className="space-y-2">
            {check.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                {l}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <CheckAnother />
    </div>
  );
}

function OfficialPanel({ alert }: { alert: Alert }) {
  return (
    <Panel title="What the agency actually said" accent>
      <p className="font-medium text-slate-50">{alert.title}</p>
      <p className="mt-2 whitespace-pre-wrap text-slate-200">{alert.body}</p>

      <div className="mt-5 space-y-3 border-t border-navy-700 pt-4 text-sm">
        <p className="text-slate-300">
          <span className="font-medium text-slate-100">{alert.agencyName}</span>
          <span className="text-slate-500"> · </span>
          {new Date(alert.issuedAt).toLocaleString()}
        </p>
        {alert.chainStatus === "confirmed" && alert.explorerUrl && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <Link2 className="h-4 w-4" aria-hidden />
              Signed on Solana
            </span>
            <ExplorerLink url={alert.explorerUrl} />
          </p>
        )}
        <VerifyButton alertId={alert.id} />
        <p className="text-xs text-slate-400">
          Integrity check proves the official alert wasn&apos;t changed. It doesn&apos;t prove claims outside it.
        </p>
      </div>
    </Panel>
  );
}

function Panel({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-navy-900 p-5 ${accent ? "border-emerald-500/30" : "border-navy-700"}`}>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-400">{title}</h2>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function CheckAnother() {
  return (
    <Link
      href="/check"
      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      <RotateCcw className="h-4 w-4" aria-hidden />
      Check another message
    </Link>
  );
}
