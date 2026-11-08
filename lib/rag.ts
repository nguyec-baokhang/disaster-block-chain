// Server-only: retrieval over official alerts and the public ledger, run before Gemini decides a check.
//
// a) exact media memory: past checks of the same image/video bytes
// b) semantic search: top-5 alerts and top-5 past checks with cosine similarity >= 0.75
// c) trusted ledger evidence: past checks whose verdict came from an official alert match or cited sources,
//    whose on-chain log verifies, and whose matched alert is still Active (read live). Everything else only
//    counts toward "seen N times".
//
// Evidence is context for the matcher, never a verdict: VERIFIED_OFFICIAL / CONTRADICTED still need an
// official on-chain alert match (or cited sources in the grounded fallback).
import { PublicKey } from "@solana/web3.js";
import { getAgency } from "./agencies";
import { verifyCheck } from "./check-log";
import { embed } from "./embed";
import { readAlertStatus } from "./registry";
import { findChecksByMediaHash, searchAlertsByVector, searchChecksByVector } from "./store";
import type { Alert, CheckResult, RegistryStatus } from "./types";

export const TOP_K = 5;
export const MIN_SIMILARITY = 0.75;
export const SAME_CLAIM_SIMILARITY = 0.9; // close enough to call it the same claim (claimId cluster)
const FACT_TIMEOUT_MS = 6_000;

export type Candidate = { check: CheckResult; similarity: number; via: "media" | "semantic" };
export type Evidence = { id: string; verdict: CheckResult["verdict"]; matchedAlertId: string | null; summary: string; chainSignature: string };

// Facts gathered from the chain for each candidate. Unknown (missing) means "not verified".
export type EvidenceFacts = {
  logVerified: ReadonlyMap<string, boolean>; // checkId → on-chain log re-hash matches and is signed by the log wallet
  alertStatus: ReadonlyMap<string, RegistryStatus | "Missing">; // alertId → live status
};

// The verdict came from an official alert match, or from cited sources.
export function hasTrustworthyBasis(c: CheckResult): boolean {
  if (c.verdict === "UNVERIFIED") return false;
  if (c.basis === "official_match" || c.basis === "exact_hash") return Boolean(c.matchedAlert?.id);
  if (c.basis === "web_sources") return c.sources.length > 0;
  return false;
}

export function isTrustedEvidence(c: CheckResult, facts: EvidenceFacts): boolean {
  if (!hasTrustworthyBasis(c)) return false;
  if (c.chainStatus !== "confirmed" || !c.chainSignature) return false;
  if (facts.logVerified.get(c.id) !== true) return false;
  if (c.matchedAlert && facts.alertStatus.get(c.matchedAlert.id) !== "Active") return false;
  return true;
}

export function classifyEvidence(candidates: Candidate[], facts: EvidenceFacts): { trusted: Evidence[]; seen: number } {
  const unique = dedupe(candidates);
  const trusted = unique
    .filter((c) => isTrustedEvidence(c.check, facts))
    .map(({ check }) => ({
      id: check.id,
      verdict: check.verdict,
      matchedAlertId: check.matchedAlert?.id ?? null,
      summary: check.summary,
      chainSignature: check.chainSignature!,
    }));
  return { trusted, seen: unique.length };
}

// Same check found twice (by media and by meaning): keep the strongest link.
function dedupe(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = best.get(c.check.id);
    if (!prev || c.via === "media" || (prev.via !== "media" && c.similarity > prev.similarity)) best.set(c.check.id, c);
  }
  return [...best.values()].sort((a, b) => (a.via === "media" ? -1 : 0) - (b.via === "media" ? -1 : 0) || b.similarity - a.similarity);
}

// Cluster: an identical media file, else a near-identical claim; otherwise this check starts its own.
export function claimIdFor(candidates: Candidate[]): string | null {
  const hit = dedupe(candidates).find((c) => c.via === "media" || c.similarity >= SAME_CLAIM_SIMILARITY);
  return hit ? (hit.check.claimId ?? hit.check.id) : null;
}

// ---------- I/O ----------

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), FACT_TIMEOUT_MS))]);
}

// Memo alerts can't be retracted; anchor alerts are read live from the registry.
async function liveAlertStatus(alertId: string, eligible: Alert[]): Promise<RegistryStatus | "Missing"> {
  const alert = eligible.find((a) => a.id === alertId);
  if (!alert) return "Missing"; // gone, unconfirmed or edited locally: not official any more
  if (alert.chainRecord !== "anchor") return "Active";
  const agency = getAgency(alert.agencyId);
  if (!agency) return "Missing";
  const live = await readAlertStatus(new PublicKey(agency.pubkey), alert.contentHash);
  return live?.status ?? "Missing";
}

export async function gatherFacts(candidates: Candidate[], eligible: Alert[]): Promise<EvidenceFacts> {
  // Only spend chain reads on candidates that could still qualify.
  const worth = dedupe(candidates).filter((c) => hasTrustworthyBasis(c.check) && c.check.chainStatus === "confirmed");
  const alertIds = [...new Set(worth.map((c) => c.check.matchedAlert?.id).filter((id): id is string => Boolean(id)))];
  const [logs, statuses] = await Promise.all([
    Promise.all(
      worth.map(async ({ check }) => {
        const r = await withTimeout(verifyCheck(check), null);
        return [check.id, Boolean(r?.hashMatches && r.signerIsCheckLog)] as const;
      }),
    ),
    Promise.all(alertIds.map(async (id) => [id, await withTimeout(liveAlertStatus(id, eligible), "Missing" as const)] as const)),
  ]);
  return { logVerified: new Map(logs), alertStatus: new Map(statuses) };
}

export type Retrieval = {
  vector: number[] | null; // the claim's embedding, reused when saving the check
  alerts: Alert[]; // retrieved official alerts, most similar first (empty if retrieval found none)
  evidence: Evidence[];
  seen: number;
  claimId: string | null;
};

// Never throws: if anything fails, the check runs exactly as it did without retrieval.
export async function retrieve(claim: string, mediaHash: string | undefined, eligible: Alert[]): Promise<Retrieval> {
  const empty: Retrieval = { vector: null, alerts: [], evidence: [], seen: 0, claimId: null };
  try {
    const [vector, sameMedia] = await Promise.all([embed(claim), mediaHash ? findChecksByMediaHash(mediaHash) : []]);
    const [alertHits, checkHits] = vector
      ? await Promise.all([searchAlertsByVector(vector, TOP_K, MIN_SIMILARITY), searchChecksByVector(vector, TOP_K, MIN_SIMILARITY)])
      : [[], []];

    const byId = new Map(eligible.map((a) => [a.id, a]));
    const alerts = alertHits.map((h) => byId.get(h.id)).filter((a): a is Alert => Boolean(a));
    const candidates: Candidate[] = [
      ...sameMedia.map((check) => ({ check, similarity: 1, via: "media" as const })),
      ...checkHits.map((h) => ({ check: h.check, similarity: h.similarity, via: "semantic" as const })),
    ];
    const { trusted, seen } = classifyEvidence(candidates, await gatherFacts(candidates, eligible));
    return { vector, alerts, evidence: trusted, seen, claimId: claimIdFor(candidates) };
  } catch (err) {
    console.error("retrieval failed, checking without it:", err);
    return empty;
  }
}
