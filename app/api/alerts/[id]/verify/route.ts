// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { getAgency, getAgencyByPubkey } from "@/lib/agencies";
import { contentHash } from "@/lib/hash";
import { readMemo } from "@/lib/solana";
import { getAlert } from "@/lib/store";
import type { VerifyResult } from "@/lib/types";

const MEMO_PATTERN = /^crisissignal:v1:([^:]+):([0-9a-f]{64})$/;

export async function GET(_req: Request, ctx: RouteContext<"/api/alerts/[id]/verify">) {
  await connection(); // reads local files and the chain — never prerender or cache
  const { id } = await ctx.params;

  const alert = await getAlert(id);
  if (!alert) return Response.json({ error: `Alert not found: ${id}` }, { status: 404 });

  // Recompute from stored fields, not alert.contentHash, so local edits are caught.
  const localHash = contentHash(alert);

  const result: VerifyResult = {
    alertId: alert.id,
    localHash,
    onChainHash: null,
    hashMatches: false,
    signer: null,
    signerIsKnownAgency: false,
    explorerUrl: alert.explorerUrl,
  };
  if (!alert.signature) return Response.json(result);

  let onChain;
  try {
    onChain = await readMemo(alert.signature);
  } catch (err) {
    return Response.json({ error: `Could not read transaction: ${(err as Error).message}` }, { status: 502 });
  }
  if (!onChain) return Response.json(result);

  const match = MEMO_PATTERN.exec(onChain.memo);
  const signerAgency = getAgencyByPubkey(onChain.signer);

  result.signer = onChain.signer;
  result.agencyName = signerAgency?.name;
  result.onChainHash = match?.[2] ?? null;
  // The memo must be for this alert ID, not one copied from another alert.
  result.hashMatches = match?.[1] === alert.id && match[2] === localHash;
  // Signer must be the agency this alert claims to be from, not just any known agency.
  result.signerIsKnownAgency = !!signerAgency && signerAgency.pubkey === getAgency(alert.agencyId)?.pubkey;

  return Response.json(result);
}
