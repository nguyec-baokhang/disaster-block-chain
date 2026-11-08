// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
// Demo agency action: the server signs retract_alert with the issuing agency's keypair.
import { connection } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { requireAdmin } from "@/lib/admin-auth";
import { getAgency, getAgencyKeypair } from "@/lib/agencies";
import { readAlert, retract } from "@/lib/registry";
import { explorerUrl } from "@/lib/solana";
import { getAlert, saveAlert } from "@/lib/store";

export async function POST(request: Request, ctx: RouteContext<"/api/alerts/[id]/retract">) {
  await connection();
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  const alert = await getAlert(id);
  if (!alert) return Response.json({ error: `Alert not found: ${id}` }, { status: 404 });
  if (alert.chainRecord !== "anchor" || alert.chainStatus !== "confirmed") {
    return Response.json({ error: "Only alerts recorded in the Anchor registry can be retracted" }, { status: 400 });
  }
  const agency = getAgency(alert.agencyId);
  if (!agency) return Response.json({ error: `Unknown agency: ${alert.agencyId}` }, { status: 400 });

  let keypair;
  try {
    keypair = getAgencyKeypair(alert.agencyId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  // Check the chain first so an already-retracted alert gets a clear answer, not a program error.
  let onChain;
  try {
    onChain = await readAlert(new PublicKey(agency.pubkey), alert.contentHash);
  } catch (err) {
    console.error(`registry read failed for ${alert.id}:`, err);
    return Response.json({ error: "Could not read the registry from Solana. Please try again." }, { status: 502 });
  }
  if (!onChain) return Response.json({ error: "No on-chain record for this alert" }, { status: 409 });
  if (onChain.status !== "Active") {
    const synced = await saveAlert({ ...alert, registryStatus: onChain.status });
    return Response.json({ error: `Alert is already ${onChain.status.toLowerCase()}`, alert: synced }, { status: 409 });
  }

  let signature;
  try {
    signature = await retract(keypair, alert.contentHash);
  } catch (err) {
    console.error(`retract failed for ${alert.id}:`, err);
    return Response.json({ error: "The retraction transaction failed. Please try again." }, { status: 502 });
  }

  // Only reached after sendAndConfirmTransaction succeeded.
  const updated = await saveAlert({ ...alert, registryStatus: "Retracted" });
  return Response.json({ alert: updated, signature, explorerUrl: explorerUrl(signature) });
}
