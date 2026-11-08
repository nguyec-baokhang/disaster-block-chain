// Pure vector helpers (no I/O), shared by lib/embed.ts and the Postgres store.
export const EMBED_DIMENSIONS = 768;

// Truncated (768 of 3072) gemini-embedding-001 vectors aren't unit length; normalize for cosine search.
export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

// pgvector text format: [0.1,0.2,...]
export function toVectorLiteral(v: number[]): string {
  if (v.length !== EMBED_DIMENSIONS || !v.every(Number.isFinite)) throw new Error(`Expected ${EMBED_DIMENSIONS} finite numbers`);
  return `[${v.join(",")}]`;
}
