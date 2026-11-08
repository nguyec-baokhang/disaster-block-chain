// "Evidence from the ledger" on the result page: what the public ledger already knew about this claim when
// it was checked. Only earlier checks count, and only public fields leave the server (no text, no users).
import type { CheckResult, Verdict } from "./types";

export const EVIDENCE_SHOWN = 3;
// Stricter than retrieval (0.75, which only orders alerts and finds candidates): shown and counted as
// "similar claims" only when it's really the same kind of claim.
export const EVIDENCE_SIMILARITY = 0.85;

export type RelatedCheck = {
  id: string;
  verdict: Verdict;
  createdAt: string;
  similarity: number; // 1 for an identical media file
  via: "media" | "semantic";
  logged: boolean; // its verdict is logged on Solana
  trusted: boolean; // it was used as verified evidence for this check
};

export type LedgerEvidenceView = {
  media: { count: number; firstSeen: string } | null; // same image/video bytes
  similar: { count: number; firstSeen: string; commonVerdict: Verdict } | null;
  top: RelatedCheck[];
};

const earliest = (checks: CheckResult[]) => checks.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), checks[0].createdAt);

// Ties go to the more decisive verdict, so "seen as contradicted" isn't hidden behind "unverified".
const VERDICT_ORDER: Verdict[] = ["CONTRADICTED", "VERIFIED_OFFICIAL", "SUPPORTED", "UNVERIFIED"];

export function mostCommonVerdict(checks: Pick<CheckResult, "verdict">[]): Verdict | null {
  const counts = new Map<Verdict, number>();
  for (const c of checks) counts.set(c.verdict, (counts.get(c.verdict) ?? 0) + 1);
  let best: Verdict | null = null;
  for (const v of VERDICT_ORDER) if ((counts.get(v) ?? 0) > (best ? counts.get(best)! : 0)) best = v;
  return best;
}

export function buildEvidenceView(
  check: CheckResult,
  sameMedia: CheckResult[],
  similar: { check: CheckResult; similarity: number }[],
): LedgerEvidenceView {
  const before = (c: CheckResult) => c.id !== check.id && c.createdAt < check.createdAt;
  const media = sameMedia.filter(before);
  const close = similar.filter((s) => before(s.check) && s.similarity >= EVIDENCE_SIMILARITY);
  const trusted = new Set(check.ledgerEvidence ?? []);

  const related = new Map<string, RelatedCheck>();
  const add = (c: CheckResult, similarity: number, via: RelatedCheck["via"]) => {
    if (related.has(c.id)) return;
    related.set(c.id, {
      id: c.id,
      verdict: c.verdict,
      createdAt: c.createdAt,
      similarity,
      via,
      logged: c.chainStatus === "confirmed" && Boolean(c.chainSignature),
      trusted: trusted.has(c.id),
    });
  };
  for (const c of media) add(c, 1, "media");
  for (const s of [...close].sort((a, b) => b.similarity - a.similarity)) add(s.check, s.similarity, "semantic");

  // Verified evidence first, then identical media, then most similar.
  const top = [...related.values()]
    .sort((a, b) => Number(b.trusted) - Number(a.trusted) || (a.via === "media" ? -1 : 0) - (b.via === "media" ? -1 : 0) || b.similarity - a.similarity)
    .slice(0, EVIDENCE_SHOWN);

  const closeChecks = close.map((s) => s.check);
  return {
    media: media.length > 0 ? { count: media.length, firstSeen: earliest(media) } : null,
    similar: closeChecks.length > 0 ? { count: closeChecks.length, firstSeen: earliest(closeChecks), commonVerdict: mostCommonVerdict(closeChecks)! } : null,
    top,
  };
}
