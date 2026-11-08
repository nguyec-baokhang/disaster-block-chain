export type Agency = { id: string; name: string; pubkey: string };

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
};
