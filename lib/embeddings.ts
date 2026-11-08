// Server-only: embed an alert or a check and save the vector. Never throws: a missing embedding must
// not break publishing or checking.
import { alertEmbeddingText, checkEmbeddingText, embed } from "./embed";
import { saveEmbedding } from "./store";
import type { Alert, CheckResult } from "./types";

export async function embedAlert(alert: Alert): Promise<boolean> {
  return store("alert", alert.id, await embed(alertEmbeddingText(alert)));
}

export async function embedCheck(check: CheckResult): Promise<boolean> {
  return store("check", check.id, await embed(checkEmbeddingText(check)));
}

async function store(kind: "alert" | "check", id: string, vector: number[] | null): Promise<boolean> {
  if (!vector) return false;
  try {
    await saveEmbedding(kind, id, vector);
    return true;
  } catch (err) {
    console.error(`saving ${kind} embedding failed for ${id}:`, (err as Error).message);
    return false;
  }
}
