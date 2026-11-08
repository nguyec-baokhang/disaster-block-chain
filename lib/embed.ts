// Server-only: Gemini text embeddings for official alerts and checked claims (stored in pgvector, or
// data/embeddings.json without a database). Embedding is best-effort: any failure returns null and the
// caller carries on without a vector.
import { client } from "./gemini";
import type { Alert, CheckResult } from "./types";
import { EMBED_DIMENSIONS, normalize } from "./vector";

const TIMEOUT_MS = 10_000;

function embedModel(): string {
  return process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
}

// What gets embedded: the alert as people would read it, and the claim text that was actually checked.
export function alertEmbeddingText(a: Pick<Alert, "title" | "body">): string {
  return `${a.title}\n\n${a.body}`.trim();
}

export function checkEmbeddingText(c: Pick<CheckResult, "inputType" | "inputText" | "extractedText" | "inputTranscript">): string | null {
  const text =
    c.inputType === "text" ? c.inputText : c.inputType === "video" ? c.inputTranscript : c.extractedText;
  return text?.trim() || null;
}

export async function embed(text: string | null): Promise<number[] | null> {
  if (!text?.trim()) return null;
  try {
    const res = await client().models.embedContent({
      model: embedModel(),
      contents: text.slice(0, 8_000),
      config: {
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: EMBED_DIMENSIONS,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length !== EMBED_DIMENSIONS) throw new Error(`Unexpected embedding length ${values?.length}`);
    return normalize(values);
  } catch (err) {
    console.error("embedding failed:", (err as Error).message);
    return null;
  }
}
