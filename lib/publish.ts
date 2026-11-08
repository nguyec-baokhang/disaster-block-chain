// Server-only: signs with agency keypairs. Do not import from client components.
import { getAgency, getAgencyKeypair } from "./agencies";
import { contentHash } from "./hash";
import { publishAlert as registryPublish, registryMode } from "./registry";
import { explorerUrl, recordMemo } from "./solana";
import { createAlert, saveAlert } from "./store";
import type { Alert } from "./types";

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

  let alert: Alert;
  try {
    if (mode === "anchor") {
      const { signature } = await registryPublish(keypair, pending.contentHash, pending.id);
      alert = { ...pending, signature, chainStatus: "confirmed", explorerUrl: explorerUrl(signature), registryStatus: "Active" };
    } else {
      const signature = await recordMemo(keypair, `crisissignal:v1:${pending.id}:${pending.contentHash}`);
      alert = { ...pending, signature, chainStatus: "confirmed", explorerUrl: explorerUrl(signature) };
    }
  } catch (err) {
    console.error(`${mode} publish failed for ${pending.id}:`, err);
    alert = { ...pending, signature: null, chainStatus: "failed", explorerUrl: null };
  }

  await saveAlert(alert);
  return alert;
}
