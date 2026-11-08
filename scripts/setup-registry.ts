// One-time setup for the crisis_registry Anchor program on Devnet:
// creates (or reuses) the registry admin keypair, funds it with 0.2 SOL from the hamilton-ema
// wallet, initializes the registry, and registers both demo agencies. Safe to re-run.
// Usage: npx tsx --env-file=.env.local scripts/setup-registry.ts
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { getAgencyKeypair, listAgencies } from "../lib/agencies";
import { programId, readAgency, readRegistry, initializeRegistry, registerAgency, registryPda } from "../lib/registry";
import { explorerUrl, getConnection } from "../lib/solana";

const FUNDER_AGENCY_ID = "hamilton-ema";
const FUND_LAMPORTS = 0.2 * LAMPORTS_PER_SOL;
const MIN_ADMIN_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

function loadOrCreateAdmin(): Keypair {
  const secret = process.env.REGISTRY_ADMIN_SECRET?.trim();
  if (secret) return Keypair.fromSecretKey(bs58.decode(secret));

  const admin = Keypair.generate();
  console.log("No REGISTRY_ADMIN_SECRET found. Generated a new admin keypair.");
  console.log("Add this to .env.local NOW (re-runs need it):\n");
  console.log(`REGISTRY_ADMIN_SECRET=${bs58.encode(admin.secretKey)}\n`);
  return admin;
}

async function main() {
  const connection = getConnection();
  const program = programId();
  if (!(await connection.getAccountInfo(program))?.executable) {
    throw new Error(`No deployed program at ${program.toBase58()} on Devnet. Check REGISTRY_PROGRAM_ID.`);
  }
  console.log(`Program:  ${program.toBase58()}`);
  console.log(`Registry: ${registryPda().toBase58()}`);

  const admin = loadOrCreateAdmin();
  console.log(`Admin:    ${admin.publicKey.toBase58()}`);

  // Fund the admin from the hamilton-ema wallet (Devnet airdrops are too unreliable at this hour).
  const balance = await connection.getBalance(admin.publicKey);
  if (balance < MIN_ADMIN_LAMPORTS) {
    const funder = getAgencyKeypair(FUNDER_AGENCY_ID);
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: admin.publicKey, lamports: FUND_LAMPORTS }),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [funder], { commitment: "confirmed" });
    console.log(`\nFunded admin with 0.2 SOL from ${FUNDER_AGENCY_ID}: ${explorerUrl(sig)}`);
  } else {
    console.log(`\nAdmin already funded (${balance / LAMPORTS_PER_SOL} SOL).`);
  }

  const registry = await readRegistry();
  if (!registry) {
    const sig = await initializeRegistry(admin);
    console.log(`Initialized registry: ${explorerUrl(sig)}`);
  } else if (registry.admin !== admin.publicKey.toBase58()) {
    throw new Error(`Registry already initialized with a different admin (${registry.admin}).`);
  } else {
    console.log("Registry already initialized.");
  }

  for (const agency of listAgencies()) {
    const authority = new PublicKey(agency.pubkey);
    const existing = await readAgency(authority);
    if (existing) {
      console.log(`Agency ${agency.id} already registered (active: ${existing.active}).`);
      continue;
    }
    const sig = await registerAgency(admin, authority, agency.name);
    console.log(`Registered ${agency.id} (${agency.pubkey}): ${explorerUrl(sig)}`);
  }

  console.log("\nDone. Set REGISTRY_MODE=anchor in .env.local to publish through the registry.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
