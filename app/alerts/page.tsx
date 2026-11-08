import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { LoaderCircle, Megaphone, Plus } from "lucide-react";
import AlertCard from "@/components/AlertCard";
import { listAlerts } from "@/lib/store";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Official alerts</h1>
          <p className="mt-2 text-slate-300">Official alerts mirrored from public feeds and anchored on Solana Devnet.</p>
        </div>
        <Link
          href="/publish"
          className="inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-navy-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add or mirror alerts
        </Link>
      </div>

      <Suspense
        fallback={
          <p className="mt-8 flex items-center gap-2 text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            Loading alerts…
          </p>
        }
      >
        <AlertList />
      </Suspense>
    </div>
  );
}

async function AlertList() {
  await connection(); // reads local files — render at request time, never prerender
  const alerts = await listAlerts();

  if (alerts.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-navy-600 bg-navy-900 p-8 text-center">
        <Megaphone className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
        <p className="mt-3 text-slate-200">No official alerts yet.</p>
        <Link href="/publish" className="mt-2 inline-block text-sky-300 hover:text-sky-200 hover:underline">
          Publish the first one
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 space-y-4">
      {alerts.map((a) => (
        <li key={a.id}>
          <AlertCard alert={a} />
        </li>
      ))}
    </ul>
  );
}
