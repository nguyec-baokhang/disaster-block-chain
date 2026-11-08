// Server-only: reads agency secret keys from env. Do not import from client components.
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import config from "@/config/agencies.json";
import type { Agency } from "./types";

type AgencyConfig = Agency & { secretEnv: string };

const agencies = config as AgencyConfig[];

export function listAgencies(): Agency[] {
  return agencies.map(({ id, name, pubkey }) => ({ id, name, pubkey }));
}

export function getAgency(id: string): Agency | undefined {
  return listAgencies().find((a) => a.id === id);
}

export function getAgencyByPubkey(pubkey: string): Agency | undefined {
  return listAgencies().find((a) => a.pubkey === pubkey);
}

// Throws if the secret is missing or doesn't match the configured pubkey.
export function getAgencyKeypair(id: string): Keypair {
  const agency = agencies.find((a) => a.id === id);
  if (!agency) throw new Error(`Unknown agency: ${id}`);
  const secret = process.env[agency.secretEnv];
  if (!secret) throw new Error(`Missing ${agency.secretEnv} in .env.local`);
  const keypair = Keypair.fromSecretKey(bs58.decode(secret.trim()));
  if (keypair.publicKey.toBase58() !== agency.pubkey) {
    throw new Error(`${agency.secretEnv} does not match the pubkey in config/agencies.json`);
  }
  return keypair;
}
