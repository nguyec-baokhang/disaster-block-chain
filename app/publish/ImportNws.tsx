"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleX, CloudLightning, LoaderCircle } from "lucide-react";
import AlertCard from "@/components/AlertCard";
import type { Alert } from "@/lib/types";

type ImportResult = { areas: string[]; found: number; skipped: number; imported: Alert[] };

export default function ImportNws() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/nws/import", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Import failed (${res.status})`);
      setResult(data as ImportResult);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Please try again." : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const failed = result?.imported.filter((a) => a.chainStatus !== "confirmed").length ?? 0;

  return (
    <section className="mt-8 rounded-xl border border-navy-700 bg-navy-900 p-5">
      <h2 className="font-medium text-slate-50">Import live NWS alerts</h2>
      <p className="mt-1 text-sm text-slate-300">
        Pulls up to 3 active alerts from weather.gov for Ohio (Hamilton County first) and signs each with the
        mirrored NWS demo wallet.
      </p>
      <button
        type="button"
        onClick={runImport}
        disabled={loading}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-navy-700 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CloudLightning className="h-4 w-4" aria-hidden />}
        {loading ? "Importing and signing on Solana…" : "Import live NWS alerts"}
      </button>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-4" role="status">
          <p className="text-sm text-slate-300">
            {result.imported.length === 0
              ? `No new alerts to import (${result.found} active in ${result.areas.join(", ")}, ${result.skipped} already imported).`
              : `Imported ${result.imported.length} alert${result.imported.length === 1 ? "" : "s"} from ${result.areas.join(", ")}.`}
            {failed > 0 && (
              <span className="text-red-300"> {failed} could not be signed on Solana and are not official records.</span>
            )}
          </p>
          {result.imported.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
          {result.imported.length > 0 && (
            <Link href="/alerts" className="inline-block text-sm text-sky-300 hover:text-sky-200 hover:underline">
              View all alerts
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
