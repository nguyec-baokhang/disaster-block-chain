"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileVideoCamera, Flag, ImageIcon, Info, Link2, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import DiffList from "@/components/DiffList";
import ExplorerLink from "@/components/ExplorerLink";
import RegistryStatusBadge from "@/components/RegistryStatusBadge";
import SourceList from "@/components/SourceList";
import SourceUrlLink from "@/components/SourceUrlLink";
import VerdictBadge from "@/components/VerdictBadge";
import VerifyButton from "@/components/VerifyButton";
import { tidyClaims } from "@/lib/claims";
import { loadThumbnail } from "@/lib/thumbnail";
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

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:py-14">
      <section className="space-y-4">
        <VerdictBadge verdict={check.verdict} />
        {check.summary && <p className="max-w-3xl text-lg text-slate-200">{check.summary}</p>}
      </section>

      {check.matchedAlert ? (
        <>
          <section aria-label="Comparison" className="grid gap-4 md:grid-cols-2">
            <Panel title="What you saw">
              <WhatYouSaw check={check} />
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
        <Panel title="What you checked">
          <WhatYouSaw check={check} />
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

// The source (text, link, screenshot or video), then what Gemini extracted from it: that is what was compared.
function WhatYouSaw({ check }: { check: CheckResult }) {
  if (check.inputType === "text") return <p className="whitespace-pre-wrap text-slate-200">{check.inputText}</p>;
  // Older checks stored untidied claims; transcripts are shown as-is.
  const extracted = check.extractedText ? tidyClaims(check.extractedText) : (check.inputTranscript ?? "");
  return (
    <div className="space-y-4">
      {check.inputType === "link" && check.sourceUrl && <LinkSource url={check.sourceUrl} title={check.sourceTitle} />}
      {check.inputType === "image" && <ImageSource checkId={check.id} />}
      {check.inputType === "video" && (
        <p className="flex items-center gap-2 text-slate-200">
          <FileVideoCamera className="h-4 w-4 text-sky-400" aria-hidden />
          Video
        </p>
      )}
      {extracted && (
        <div className="rounded-lg border border-navy-600 bg-navy-800/60 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {check.inputType === "video" ? "What Gemini extracted (transcript)" : "What Gemini extracted"}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{extracted}</p>
          <p className="mt-2 text-xs text-slate-400">This is what was compared against official alerts.</p>
        </div>
      )}
    </div>
  );
}

function LinkSource({ url, title }: { url: string; title?: string }) {
  let safe: URL | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") safe = u;
  } catch {}
  return (
    <div className="min-w-0">
      {title && <p className="font-medium text-slate-50">{title}</p>}
      {safe ? (
        <a
          href={safe.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-sm text-sky-300 hover:text-sky-200 hover:underline"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {safe.href}
        </a>
      ) : (
        <p className="mt-1 break-all text-sm text-slate-300">{url}</p>
      )}
    </div>
  );
}

// The screenshot itself isn't stored; the thumbnail only exists in the browser tab that uploaded it.
function ImageSource({ checkId }: { checkId: string }) {
  const [thumb] = useState(() => (typeof window === "undefined" ? null : loadThumbnail(checkId)));
  if (!thumb) {
    return (
      <p className="flex items-center gap-2 text-slate-200">
        <ImageIcon className="h-4 w-4 text-sky-400" aria-hidden />
        Screenshot
      </p>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a local data: URL thumbnail
  return <img src={thumb} alt="The screenshot you checked" className="max-h-72 rounded-lg border border-navy-600 object-contain" />;
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
        {alert.sourceUrl && <SourceUrlLink url={alert.sourceUrl} />}
        {alert.chainStatus === "confirmed" && alert.explorerUrl && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <Link2 className="h-4 w-4" aria-hidden />
              Signed on Solana
            </span>
            {alert.registryStatus && <RegistryStatusBadge status={alert.registryStatus} />}
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
