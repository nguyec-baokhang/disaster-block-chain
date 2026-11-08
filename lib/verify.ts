import { getAgency, getAgencyByPubkey } from "./agencies";
import { contentHash } from "./hash";
import type { Alert, VerifyResult } from "./types";

const MEMO_PATTERN = /^crisissignal:v1:([^:]+):([0-9a-f]{64})$/;

export type OnChainMemo = { memo: string; signer: string };

// True when the stored record still matches what was hashed at publish time and names its
// agency correctly. agencyName isn't part of contentHash, so it is checked against config.
export function isLocallyIntact(alert: Alert): boolean {
  return contentHash(alert) === alert.contentHash && getAgency(alert.agencyId)?.name === alert.agencyName;
}

// Compares a stored alert with the memo read from its transaction (null = no memo found).
export function buildVerifyResult(alert: Alert, onChain: OnChainMemo | null): VerifyResult {
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
  if (!onChain) return result;

  const match = MEMO_PATTERN.exec(onChain.memo);
  const signerAgency = getAgencyByPubkey(onChain.signer);
  const claimedAgency = getAgency(alert.agencyId);

  result.signer = onChain.signer;
  result.agencyName = signerAgency?.name;
  result.onChainHash = match?.[2] ?? null;
  // The memo must be for this alert ID, not one copied from another alert.
  result.hashMatches = match?.[1] === alert.id && match[2] === localHash;
  // Signer must be the agency this alert claims to be from, and the stored name must be that agency's.
  result.signerIsKnownAgency =
    !!signerAgency && signerAgency.pubkey === claimedAgency?.pubkey && alert.agencyName === signerAgency.name;
  return result;
}
