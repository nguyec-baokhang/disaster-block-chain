// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAgency, getAgencyByPubkey } from "@/lib/agencies";
import { contentHash } from "@/lib/hash";
import { readAgency, readAlert } from "@/lib/registry";
import { readMemo } from "@/lib/solana";
import { getAlert, saveAlert } from "@/lib/store";
import type { Alert, VerifyResult } from "@/lib/types";

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
    chainRecord: alert.chainRecord ?? "memo",
  };
  if (!alert.signature) return Response.json(result);
  if (alert.chainRecord === "anchor") return verifyAnchor(alert, result);

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

// Anchor registry: the Alert PDA is derived from the claimed agency wallet + the stored contentHash,
// so a forged record has no PDA, and an edited one has a PDA whose hash no longer matches.
async function verifyAnchor(alert: Alert, result: VerifyResult): Promise<Response> {
  result.registryStatus = null;
  const claimed = getAgency(alert.agencyId);
  if (!claimed) return Response.json(result);

  const authority = new PublicKey(claimed.pubkey);
  let onChain, agencyRecord;
  try {
    [onChain, agencyRecord] = await Promise.all([
      /^[0-9a-f]{64}$/.test(alert.contentHash) ? readAlert(authority, alert.contentHash) : null,
      readAgency(authority),
    ]);
  } catch (err) {
    return Response.json({ error: `Could not read registry: ${(err as Error).message}` }, { status: 502 });
  }
  result.agencyActive = !!agencyRecord?.active;
  if (!onChain) return Response.json(result);

  const signerAgency = getAgencyByPubkey(onChain.authority);
  result.signer = onChain.authority;
  result.agencyName = signerAgency?.name;
  result.onChainHash = onChain.contentHash;
  // The record must be for this alert ID, not one copied from another alert.
  result.hashMatches = onChain.alertId === alert.id && onChain.contentHash === result.localHash;
  result.signerIsKnownAgency = !!signerAgency && signerAgency.pubkey === claimed.pubkey;
  result.registryStatus = onChain.status;
  result.supersededBy = onChain.supersededBy;

  // Keep the cached badge in sync with the chain (e.g. after a retraction).
  if (alert.registryStatus !== onChain.status) await saveAlert({ ...alert, registryStatus: onChain.status });

  return Response.json(result);
}
