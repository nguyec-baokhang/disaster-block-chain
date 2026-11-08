// Pure vector helpers (no I/O), shared by lib/embed.ts, lib/rag.ts and the stores.
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

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Top-k by cosine similarity, most similar first, keeping only similarity >= minSimilarity.
// Same contract as the pgvector queries (similarity = 1 - cosine distance).
export function rankByCosine(query: number[], items: { id: string; vector: number[] }[], k: number, minSimilarity: number) {
  return items
    .map(({ id, vector }) => ({ id, similarity: cosineSimilarity(query, vector) }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
    .slice(0, k);
}
