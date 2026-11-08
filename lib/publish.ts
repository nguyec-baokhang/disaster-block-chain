// Server-only: signs with agency keypairs. Do not import from client components.
import type { Keypair } from "@solana/web3.js";
import { getAgency, getAgencyKeypair } from "./agencies";
import { contentHash } from "./hash";
import { publishAlert as registryPublish, registryMode } from "./registry";
import { explorerUrl, recordMemo } from "./solana";
import { createAlert, getAlert, saveAlert } from "./store";
import type { Alert } from "./types";
import { isLocallyIntact } from "./verify";

export type PublishInput = {
  agencyId: string;
  title: string;
  body: string;
  mediaHash?: string;
  transcript?: string;
  sourceUrl?: string;
};

export class PublishError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "PublishError";
  }
}

// Saves the alert as pending, records its hash on Solana (memo or Anchor registry, per REGISTRY_MODE),
// then saves it as confirmed or failed.
// Throws PublishError for an unknown agency or missing keypair (nothing is saved then).
export async function publishAlert(input: PublishInput): Promise<Alert> {
  const { agencyId, title, body, mediaHash, transcript, sourceUrl } = input;

  const agency = getAgency(agencyId);
  if (!agency) throw new PublishError(`Unknown agency: ${agencyId}`, 400);

  let keypair;
  try {
    keypair = getAgencyKeypair(agencyId);
  } catch (err) {
    throw new PublishError((err as Error).message, 500);
  }

  const mode = registryMode();
  const issuedAt = new Date().toISOString();
  const pending = await createAlert((id) => ({
    id,
    agencyId,
    agencyName: agency.name,
    title,
    body,
    ...(transcript && { transcript }),
    ...(mediaHash && { mediaHash }),
    contentHash: contentHash({ agencyId, title, body, issuedAt, mediaHash }),
    signature: null,
    chainStatus: "pending",
    explorerUrl: null,
    issuedAt,
    ...(sourceUrl && { sourceUrl }),
    chainRecord: mode,
  }));

  return signAndSave(pending, keypair);
}

const retrying = new Set<string>();

// Re-sends the on-chain record for an alert whose Solana transaction failed, the same way it was first
// attempted (memo or Anchor registry, from alert.chainRecord). The stored record must be unchanged
// since it was hashed, so a locally edited alert can never get signed.
export async function retryAlert(id: string): Promise<Alert> {
  const alert = await getAlert(id);
  if (!alert) throw new PublishError(`Alert not found: ${id}`, 404);
  if (alert.chainStatus !== "failed") throw new PublishError(`Alert ${id} is ${alert.chainStatus}, not failed`, 409);
  if (!isLocallyIntact(alert)) throw new PublishError(`Alert ${id} was changed after it was created`, 409);

  let keypair;
  try {
    keypair = getAgencyKeypair(alert.agencyId);
  } catch (err) {
    throw new PublishError((err as Error).message, 500);
  }

  // A second click while the first transaction is in flight would record a duplicate.
  if (retrying.has(id)) throw new PublishError(`Alert ${id} is already being retried`, 409);
  retrying.add(id);
  try {
    return await signAndSave(alert, keypair);
  } finally {
    retrying.delete(id);
  }
}

// Status is "confirmed" only if sendAndConfirmTransaction succeeded; anything else is "failed".
async function signAndSave(alert: Alert, keypair: Keypair): Promise<Alert> {
  const mode = alert.chainRecord ?? "memo";
  let saved: Alert;
  try {
    if (mode === "anchor") {
      const { signature } = await registryPublish(keypair, alert.contentHash, alert.id);
      saved = { ...alert, signature, chainStatus: "confirmed", explorerUrl: explorerUrl(signature), registryStatus: "Active" };
    } else {
      const signature = await recordMemo(keypair, `crisissignal:v1:${alert.id}:${alert.contentHash}`);
      saved = { ...alert, signature, chainStatus: "confirmed", explorerUrl: explorerUrl(signature) };
    }
  } catch (err) {
    console.error(`${mode} publish failed for ${alert.id}:`, err);
    saved = { ...alert, signature: null, chainStatus: "failed", explorerUrl: null };
  }
  return saveAlert(saved);
}
