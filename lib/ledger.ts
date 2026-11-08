// The public fake-claim ledger. Entries are a narrow public projection of a check: never the owner's
// user id or email, and contact details people pasted into their own messages are redacted.
import { tidyClaims } from "./claims";
import { redact } from "./redact";
import type { CheckResult, Verdict } from "./types";

export const LEDGER_VERDICTS: Verdict[] = ["CONTRADICTED", "UNVERIFIED", "SUPPORTED", "VERIFIED_OFFICIAL"];
export const LEDGER_TYPES: CheckResult["inputType"][] = ["text", "link", "image", "video"];
export const LEDGER_LIMIT = 100;
const PREVIEW_CHARS = 220;

export type LedgerEntry = {
  id: string;
  verdict: Verdict;
  inputType: CheckResult["inputType"];
  preview: string;
  createdAt: string;
  chainStatus?: CheckResult["chainStatus"];
  chainSignature?: string; // public tx id of the hash-only log memo
};

export type LedgerFilters = { verdict?: Verdict; type?: CheckResult["inputType"] };

// Only known values pass; anything else means "no filter".
export function parseLedgerFilters(params: { verdict?: string | string[]; type?: string | string[] }): LedgerFilters {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const verdict = LEDGER_VERDICTS.find((v) => v === one(params.verdict));
  const type = LEDGER_TYPES.find((t) => t === one(params.type));
  return { ...(verdict ? { verdict } : {}), ...(type ? { type } : {}) };
}

export { redact };

function hostOf(url?: string): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function previewOf(c: CheckResult): string {
  let raw: string;
  if (c.inputType === "text") raw = c.inputText ?? "";
  else if (c.inputType === "link") {
    const host = hostOf(c.sourceUrl);
    raw = [c.sourceTitle, host && `(${host})`].filter(Boolean).join(" ") || (c.extractedText ? tidyClaims(c.extractedText) : "");
  } else if (c.extractedText) raw = tidyClaims(c.extractedText);
  else raw = c.inputTranscript ?? "";
  if (!raw.trim()) raw = c.summary;
  const flat = raw
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter((l) => l && !/^shown as from:/i.test(l))
    .join(" · ");
  const safe = redact(flat);
  return safe.length > PREVIEW_CHARS ? `${safe.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : safe;
}

export function toLedgerEntry(c: CheckResult): LedgerEntry {
  const entry: LedgerEntry = { id: c.id, verdict: c.verdict, inputType: c.inputType, preview: previewOf(c), createdAt: c.createdAt };
  if (c.chainStatus) entry.chainStatus = c.chainStatus;
  if (c.chainStatus === "confirmed" && c.chainSignature) entry.chainSignature = c.chainSignature;
  return entry;
}

// JSON-store version of the Postgres query in store-pg.ts.
export function filterChecks(checks: CheckResult[], filters: LedgerFilters, limit = LEDGER_LIMIT): CheckResult[] {
  return checks
    .filter((c) => (!filters.verdict || c.verdict === filters.verdict) && (!filters.type || c.inputType === filters.type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
