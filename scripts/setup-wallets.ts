// Generates the demo agency keypairs, writes their pubkeys into config/agencies.json,
// prints the secrets for .env.local, and requests a 1 SOL Devnet airdrop for each.
// Usage: npx tsx scripts/setup-wallets.ts [--force]
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

type AgencyConfig = { id: string; name: string; pubkey: string; secretEnv: string };

const CONFIG_PATH = path.join(process.cwd(), "config", "agencies.json");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

if (!RPC_URL.includes("devnet")) {
  console.error(`Refusing to run against non-Devnet RPC: ${RPC_URL}`);
  process.exit(1);
}

async function main() {
  const agencies: AgencyConfig[] = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

  // Don't silently replace wallets that may already be funded and in .env.local.
  const alreadySet = agencies.some((a) => !a.pubkey.startsWith("<"));
  if (alreadySet && !process.argv.includes("--force")) {
    console.error("config/agencies.json already has pubkeys. Re-run with --force to regenerate.");
    process.exit(1);
  }

  const keypairs = agencies.map(() => Keypair.generate());
  agencies.forEach((a, i) => (a.pubkey = keypairs[i].publicKey.toBase58()));
  writeFileSync(CONFIG_PATH, JSON.stringify(agencies, null, 2) + "\n");
  console.log(`Wrote pubkeys to ${CONFIG_PATH}\n`);

  console.log("Add these to .env.local:\n");
  agencies.forEach((a, i) => console.log(`${a.secretEnv}=${bs58.encode(keypairs[i].secretKey)}`));
  console.log();

  const connection = new Connection(RPC_URL, "confirmed");
  for (const [i, a] of agencies.entries()) {
    const pubkey = keypairs[i].publicKey;
    try {
      const sig = await connection.requestAirdrop(pubkey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      const balance = await connection.getBalance(pubkey);
      console.log(`Airdropped 1 SOL to ${a.id} (${pubkey.toBase58()}), balance ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (err) {
      console.warn(`Airdrop failed for ${a.id} (${pubkey.toBase58()}): ${(err as Error).message}`);
      console.warn("  Fund it manually at https://faucet.solana.com (Devnet).");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
