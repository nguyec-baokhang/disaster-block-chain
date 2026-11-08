// Server-only: an append-only public log of check verdicts on Solana Devnet.
// Each check gets an SPL memo "crisissignal:check:v1:<checkId>:<hash>" signed by CHECKS_LOG_SECRET.
// Only hashes and the verdict go on-chain: never the checked text, media or anything about the user.
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { sha256 } from "./hash";
import { explorerUrl, readMemo, recordMemo } from "./solana";
import { getCheck, saveCheck } from "./store";
import type { CheckResult } from "./types";

const MEMO_PREFIX = "crisissignal:check:v1:";

type Hashable = Pick<CheckResult, "id" | "verdict" | "basis" | "matchedAlert" | "createdAt" | "inputHash" | "mediaHash">;

// Canonical key order is part of the protocol. Do not reorder; bump the memo version instead.
export function checkLogHash(c: Hashable): string {
  return sha256(
    JSON.stringify({
      checkId: c.id,
      verdict: c.verdict,
      basis: c.basis,
      matchedAlertId: c.matchedAlert?.id ?? null,
      createdAt: c.createdAt,
      inputHash: c.inputHash ?? null,
      mediaHash: c.mediaHash ?? null,
    }),
  );
}

export function checkLogMemo(checkId: string, hash: string): string {
  return `${MEMO_PREFIX}${checkId}:${hash}`;
}

export function parseCheckLogMemo(memo: string): { checkId: string; hash: string } | null {
  const m = memo.match(/^crisissignal:check:v1:([A-Za-z0-9-]{1,32}):([0-9a-f]{64})$/);
  return m ? { checkId: m[1], hash: m[2] } : null;
}

// Null when the log is off. Throws if the secret is set but malformed.
export function getCheckLogKeypair(): Keypair | null {
  const secret = process.env.CHECKS_LOG_SECRET?.trim();
  return secret ? Keypair.fromSecretKey(bs58.decode(secret)) : null;
}

export function checkLogEnabled(): boolean {
  return Boolean(process.env.CHECKS_LOG_SECRET?.trim());
}

// Runs after the response (next/server `after`). Records the memo, then stores the outcome.
// "confirmed" only after sendAndConfirmTransaction succeeded.
export async function anchorCheck(checkId: string): Promise<void> {
  const keypair = getCheckLogKeypair();
  if (!keypair) return;
  const check = await getCheck(checkId);
  if (!check) return;
  try {
    const signature = await recordMemo(keypair, checkLogMemo(check.id, checkLogHash(check)));
    await saveCheck({ ...((await getCheck(checkId)) ?? check), chainSignature: signature, chainStatus: "confirmed" });
  } catch (err) {
    console.error(`check log failed for ${checkId}:`, err);
    await saveCheck({ ...((await getCheck(checkId)) ?? check), chainStatus: "failed" });
  }
}

export type CheckVerifyResult = {
  checkId: string;
  localHash: string;
  onChainHash: string | null;
  hashMatches: boolean;
  signer: string | null;
  signerIsCheckLog: boolean;
  explorerUrl: string | null;
};

// Re-hash the stored check and compare with the memo actually on-chain.
export function buildCheckVerifyResult(
  check: CheckResult,
  onChain: { memo: string; signer: string } | null,
  logPubkey: string | null,
): CheckVerifyResult {
  const localHash = checkLogHash(check);
  const parsed = onChain ? parseCheckLogMemo(onChain.memo) : null;
  const onChainHash = parsed && parsed.checkId === check.id ? parsed.hash : null;
  return {
    checkId: check.id,
    localHash,
    onChainHash,
    hashMatches: onChainHash === localHash,
    signer: onChain?.signer ?? null,
    signerIsCheckLog: Boolean(onChain && logPubkey && onChain.signer === logPubkey),
    explorerUrl: check.chainSignature ? explorerUrl(check.chainSignature) : null,
  };
}

export async function verifyCheck(check: CheckResult): Promise<CheckVerifyResult> {
  const logPubkey = getCheckLogKeypair()?.publicKey.toBase58() ?? null;
  const onChain = check.chainSignature ? await readMemo(check.chainSignature) : null;
  return buildCheckVerifyResult(check, onChain, logPubkey);
}
