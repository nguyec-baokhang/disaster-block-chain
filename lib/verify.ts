import { getAgency, getAgencyByPubkey } from "./agencies";
import { contentHash } from "./hash";
import type { RegistryAgency, RegistryAlert } from "./registry";
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
    chainRecord: "memo",
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

// Anchor counterpart of buildVerifyResult. The Alert PDA is derived from the claimed agency's wallet
// and the stored contentHash, so a forged record has no PDA (onChain = null) and an edited one has a
// PDA whose hash no longer matches. agencyRecord is that wallet's Agency PDA (null = not registered).
export function buildAnchorVerifyResult(
  alert: Alert,
  onChain: RegistryAlert | null,
  agencyRecord: RegistryAgency | null,
): VerifyResult {
  const result: VerifyResult = {
    alertId: alert.id,
    localHash: contentHash(alert),
    onChainHash: null,
    hashMatches: false,
    signer: null,
    signerIsKnownAgency: false,
    explorerUrl: alert.explorerUrl,
    chainRecord: "anchor",
    registryStatus: null,
    agencyActive: !!agencyRecord?.active,
  };
  if (!onChain) return result;

  const signerAgency = getAgencyByPubkey(onChain.authority);
  const claimedAgency = getAgency(alert.agencyId);

  result.signer = onChain.authority;
  result.agencyName = signerAgency?.name;
  result.onChainHash = onChain.contentHash;
  // The record must be for this alert ID, not one copied from another alert.
  result.hashMatches = onChain.alertId === alert.id && onChain.contentHash === result.localHash;
  // Same rule as memo records: the claimed agency's wallet, and the stored name must be that agency's.
  result.signerIsKnownAgency =
    !!signerAgency && signerAgency.pubkey === claimedAgency?.pubkey && alert.agencyName === signerAgency.name;
  result.registryStatus = onChain.status;
  result.supersededBy = onChain.supersededBy;
  return result;
}
