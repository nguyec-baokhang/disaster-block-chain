import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  type ParsedInstruction,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

let connection: Connection | null = null;
export function getConnection(): Connection {
  // Devnet only — refuse anything else rather than spend real SOL.
  if (!RPC_URL.includes("devnet")) throw new Error(`Refusing non-Devnet RPC: ${RPC_URL}`);
  connection ??= new Connection(RPC_URL, "confirmed");
  return connection;
}

// Returns the signature only after the tx is confirmed; throws otherwise.
export async function recordMemo(keypair: Keypair, memo: string): Promise<string> {
  const tx = new Transaction().add(createMemoInstruction(memo, [keypair.publicKey]));
  return sendAndConfirmTransaction(getConnection(), tx, [keypair], { commitment: "confirmed" });
}

// Returns null if the tx doesn't exist, failed, or has no memo instruction.
export async function readMemo(signature: string): Promise<{ memo: string; signer: string } | null> {
  const tx = await getConnection().getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || tx.meta?.err) return null;

  const memoIx = tx.transaction.message.instructions.find(
    (ix): ix is ParsedInstruction => "parsed" in ix && ix.program === "spl-memo",
  );
  const signer = tx.transaction.message.accountKeys.find((k) => k.signer);
  if (!memoIx || typeof memoIx.parsed !== "string" || !signer) return null;

  return { memo: memoIx.parsed, signer: signer.pubkey.toBase58() };
}

export { explorerUrl } from "./explorer";
