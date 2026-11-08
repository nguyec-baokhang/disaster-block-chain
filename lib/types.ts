export type Agency = { id: string; name: string; pubkey: string };

export type ChainRecord = "memo" | "anchor";
export type RegistryStatus = "Active" | "Retracted" | "Superseded";

export type Alert = {
  id: string;                 // "AL-001"
  agencyId: string;
  agencyName: string;
  title: string;
  body: string;
  transcript?: string;        // if a video was attached (Gemini-generated)
  mediaHash?: string;         // sha256 of the uploaded video bytes
  contentHash: string;        // sha256 of canonical alert JSON
  signature: string | null;   // Solana tx signature
  chainStatus: "confirmed" | "pending" | "failed";
  explorerUrl: string | null;
  issuedAt: string;           // ISO
  sourceUrl?: string;         // original source, e.g. a weather.gov alert (not part of contentHash)
  chainRecord?: ChainRecord;  // how contentHash was recorded; absent = "memo"
  registryStatus?: RegistryStatus; // anchor only: last on-chain status seen (verify reads the live one)
};

export type Verdict = "VERIFIED_OFFICIAL" | "CONTRADICTED" | "SUPPORTED" | "UNVERIFIED";

export type Source = { title: string; uri: string };

export type CheckResult = {
  id: string;                 // "CK-001"
  inputType: "text" | "video";
  inputText?: string;
  inputTranscript?: string;
  verdict: Verdict;
  basis: "exact_hash" | "official_match" | "web_sources" | "none";
  summary: string;            // 1–2 plain-English sentences
  matchedAlert?: Alert;
  differences: string[];      // how the input differs from the official alert
  sources: Source[];          // ONLY from Gemini groundingMetadata
  redFlags: string[];
  limitations: string[];
  createdAt: string;
  userId?: string;            // Auth0 sub of the logged-in user who ran it; absent = anonymous
  userEmail?: string;         // private: stripped from public responses (lib/checks.ts)
};

export type VerifyResult = {
  alertId: string;
  localHash: string;
  onChainHash: string | null;
  hashMatches: boolean;
  signer: string | null;
  signerIsKnownAgency: boolean;
  agencyName?: string;
  explorerUrl: string | null;
  chainRecord?: ChainRecord;
  registryStatus?: RegistryStatus | null; // anchor only: live on-chain status, null if no Alert PDA
  supersededBy?: string | null;           // anchor only: replacement Alert PDA address
  agencyActive?: boolean;                 // anchor only: Agency PDA exists and is active
};
