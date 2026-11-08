import { createHash } from "crypto";

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

type HashableAlert = {
  agencyId: string;
  title: string;
  body: string;
  issuedAt: string;
  mediaHash?: string;
};

// Canonical key order is part of the protocol (PLAN.md section 9). Do not reorder.
export function contentHash(a: HashableAlert): string {
  return sha256(
    JSON.stringify({
      agencyId: a.agencyId,
      title: a.title,
      body: a.body,
      issuedAt: a.issuedAt,
      mediaHash: a.mediaHash ?? null,
    }),
  );
}
