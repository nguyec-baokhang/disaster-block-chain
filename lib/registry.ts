// Server-only: client for the crisis_registry Anchor program. Do not import from client components.
import { Program, type IdlAccounts, type Provider } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "./idl/crisis_registry.json";
import type { CrisisRegistry } from "./idl/crisis_registry";
import { getConnection } from "./solana";
import type { RegistryStatus } from "./types";

export type RegistryMode = "anchor" | "memo";

export function registryMode(): RegistryMode {
  return process.env.REGISTRY_MODE === "anchor" ? "anchor" : "memo";
}

export function programId(): PublicKey {
  return new PublicKey(process.env.REGISTRY_PROGRAM_ID || idlJson.address);
}

type OnChainAlert = IdlAccounts<CrisisRegistry>["alert"];
type OnChainAgency = IdlAccounts<CrisisRegistry>["agency"];
type OnChainRegistry = IdlAccounts<CrisisRegistry>["registry"];

let program: Program<CrisisRegistry> | null = null;
function getProgram(): Program<CrisisRegistry> {
  // Read-only provider: we build instructions with Anchor and send them ourselves.
  program ??= new Program<CrisisRegistry>(
    { ...(idlJson as CrisisRegistry), address: programId().toBase58() },
    { connection: getConnection() } as Provider,
  );
  return program;
}

// ---------- PDAs ----------

export function registryPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("registry")], programId())[0];
}

export function agencyPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("agency"), authority.toBuffer()], programId())[0];
}

export function alertPda(authority: PublicKey, contentHashHex: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alert"), authority.toBuffer(), hashBytes(contentHashHex)],
    programId(),
  )[0];
}

function hashBytes(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`Not a sha256 hex hash: ${hex}`);
  return Buffer.from(hex, "hex");
}

// Anchor decodes enums as { active: {} } etc.
function statusOf(raw: OnChainAlert["status"]): RegistryStatus {
  if ("retracted" in raw) return "Retracted";
  if ("superseded" in raw) return "Superseded";
  return "Active";
}

// Returns the signature only after the tx is confirmed; throws otherwise.
async function send(ix: TransactionInstruction, signers: Keypair[]): Promise<string> {
  return sendAndConfirmTransaction(getConnection(), new Transaction().add(ix), signers, { commitment: "confirmed" });
}

// ---------- Writes ----------

// The agency keypair is both fee payer and signer, and pays rent for the alert PDA.
export async function publishAlert(
  agency: Keypair,
  contentHashHex: string,
  alertId: string,
): Promise<{ signature: string; alertAddress: string }> {
  const authority = agency.publicKey;
  const alert = alertPda(authority, contentHashHex);
  const ix = await getProgram()
    .methods.publishAlert([...hashBytes(contentHashHex)], alertId)
    .accountsStrict({ agency: agencyPda(authority), alert, authority, systemProgram: SystemProgram.programId })
    .instruction();
  return { signature: await send(ix, [agency]), alertAddress: alert.toBase58() };
}

export async function retract(agency: Keypair, contentHashHex: string): Promise<string> {
  const ix = await getProgram()
    .methods.retractAlert()
    .accountsStrict({ alert: alertPda(agency.publicKey, contentHashHex), authority: agency.publicKey })
    .instruction();
  return send(ix, [agency]);
}

// Setup only (scripts/setup-registry.ts).
export async function initializeRegistry(admin: Keypair): Promise<string> {
  const ix = await getProgram()
    .methods.initialize()
    .accountsStrict({ registry: registryPda(), admin: admin.publicKey, systemProgram: SystemProgram.programId })
    .instruction();
  return send(ix, [admin]);
}

export async function registerAgency(admin: Keypair, authority: PublicKey, name: string): Promise<string> {
  const ix = await getProgram()
    .methods.registerAgency(name)
    .accountsStrict({
      registry: registryPda(),
      agency: agencyPda(authority),
      authority,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return send(ix, [admin]);
}

// ---------- Reads ----------

export type RegistryAlert = {
  address: string;
  authority: string;
  contentHash: string;
  alertId: string;
  issuedAt: string; // ISO, from the on-chain Clock
  status: RegistryStatus;
  supersededBy: string | null;
};

export type RegistryAgency = { address: string; name: string; authority: string; active: boolean };

// Returns null if no Alert PDA exists for this agency + hash.
export async function readAlert(agencyAuthority: PublicKey, contentHashHex: string): Promise<RegistryAlert | null> {
  const address = alertPda(agencyAuthority, contentHashHex);
  const a = await getProgram().account.alert.fetchNullable(address);
  if (!a) return null;
  return {
    address: address.toBase58(),
    authority: a.authority.toBase58(),
    contentHash: Buffer.from(a.contentHash).toString("hex"),
    alertId: a.alertId,
    issuedAt: new Date(a.issuedAt.toNumber() * 1000).toISOString(),
    status: statusOf(a.status),
    supersededBy: a.supersededBy?.toBase58() ?? null,
  };
}

export async function readAgency(authority: PublicKey): Promise<RegistryAgency | null> {
  const address = agencyPda(authority);
  const a: OnChainAgency | null = await getProgram().account.agency.fetchNullable(address);
  if (!a) return null;
  return { address: address.toBase58(), name: a.name, authority: a.authority.toBase58(), active: a.active };
}

export async function readRegistry(): Promise<{ admin: string } | null> {
  const r: OnChainRegistry | null = await getProgram().account.registry.fetchNullable(registryPda());
  return r && { admin: r.admin.toBase58() };
}

// Live status for checks. A retracted or superseded Alert PDA can't be written again, so its most
// recent transaction is the one that changed its status; its block time is when that happened.
export async function readAlertStatus(
  agencyAuthority: PublicKey,
  contentHashHex: string,
): Promise<(RegistryAlert & { statusChangedAt: string | null }) | null> {
  const alert = await readAlert(agencyAuthority, contentHashHex);
  if (!alert) return null;
  if (alert.status === "Active") return { ...alert, statusChangedAt: null };

  const [latest] = await getConnection().getSignaturesForAddress(new PublicKey(alert.address), { limit: 1 });
  const at = latest?.blockTime ? new Date(latest.blockTime * 1000).toISOString() : null;
  return { ...alert, statusChangedAt: at };
}
