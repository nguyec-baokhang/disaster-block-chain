// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAgency } from "@/lib/agencies";
import { readAgency, readAlert } from "@/lib/registry";
import { readMemo } from "@/lib/solana";
import { getAlert, saveAlert } from "@/lib/store";
import type { Alert } from "@/lib/types";
import { buildAnchorVerifyResult, buildVerifyResult } from "@/lib/verify";

export async function GET(_req: Request, ctx: RouteContext<"/api/alerts/[id]/verify">) {
  await connection(); // reads local files and the chain — never prerender or cache
  const { id } = await ctx.params;

  const alert = await getAlert(id);
  if (!alert) return Response.json({ error: `Alert not found: ${id}` }, { status: 404 });
  if (alert.chainRecord === "anchor") return verifyAnchor(alert);
  if (!alert.signature) return Response.json(buildVerifyResult(alert, null));

  try {
    return Response.json(buildVerifyResult(alert, await readMemo(alert.signature)));
  } catch (err) {
    console.error(`readMemo failed for ${alert.id}:`, err);
    return Response.json({ error: "Could not read the transaction from Solana. Please try again." }, { status: 502 });
  }
}

async function verifyAnchor(alert: Alert): Promise<Response> {
  const claimed = getAgency(alert.agencyId);
  if (!alert.signature || !claimed) return Response.json(buildAnchorVerifyResult(alert, null, null));

  const authority = new PublicKey(claimed.pubkey);
  let onChain, agencyRecord;
  try {
    [onChain, agencyRecord] = await Promise.all([
      /^[0-9a-f]{64}$/.test(alert.contentHash) ? readAlert(authority, alert.contentHash) : null,
      readAgency(authority),
    ]);
  } catch (err) {
    console.error(`registry read failed for ${alert.id}:`, err);
    return Response.json({ error: "Could not read the registry from Solana. Please try again." }, { status: 502 });
  }

  // Keep the cached badge in sync with the chain (e.g. after a retraction).
  if (onChain && alert.registryStatus !== onChain.status) await saveAlert({ ...alert, registryStatus: onChain.status });

  return Response.json(buildAnchorVerifyResult(alert, onChain, agencyRecord));
}
