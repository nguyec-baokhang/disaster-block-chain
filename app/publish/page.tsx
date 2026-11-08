import { LogOut } from "lucide-react";
import { listAgencies } from "@/lib/agencies";
import { logout } from "../admin/actions";
import ImportNws from "./ImportNws";
import PublishForm from "./PublishForm";

export default function PublishPage() {
  // listAgencies() returns only id, name and pubkey — no secrets reach the client.
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Admin: add or mirror official alerts (demo)</h1>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-navy-700"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </form>
      </div>
      <p className="mt-2 text-slate-300">
        Each alert&apos;s fingerprint is recorded on Solana Devnet.
      </p>
      <p className="mt-2 text-sm text-slate-400">
        In production, alerts are mirrored automatically. Agencies can optionally sign with their own wallet.
      </p>
      <ImportNws />
      <PublishForm agencies={listAgencies()} />
    </div>
  );
}
