import { listAgencies } from "@/lib/agencies";
import PublishForm from "./PublishForm";

export default function PublishPage() {
  // listAgencies() returns only id, name and pubkey — no secrets reach the client.
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Publish an official alert</h1>
      <p className="mt-2 text-slate-300">
        The alert&apos;s fingerprint is recorded on Solana Devnet, signed by the agency&apos;s wallet.
      </p>
      <PublishForm agencies={listAgencies()} />
    </div>
  );
}
