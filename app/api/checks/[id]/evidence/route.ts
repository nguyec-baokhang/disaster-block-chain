// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { buildEvidenceView } from "@/lib/evidence";
import { MIN_SIMILARITY } from "@/lib/rag";
import { findChecksByMediaHash, getCheck, getEmbedding, similarChecksBefore } from "@/lib/store";

// Public: earlier checks of the same media or a similar claim. Returns ids, verdicts, dates, similarity
// and on-chain status only (never text or user info).
export async function GET(_req: Request, ctx: RouteContext<"/api/checks/[id]/evidence">) {
  await connection(); // reads the store — never prerender or cache
  const { id } = await ctx.params;
  const check = await getCheck(id);
  if (!check) return Response.json({ error: `Check not found: ${id}` }, { status: 404 });

  const vector = await getEmbedding("check", id).catch(() => undefined);
  const [sameMedia, similar] = await Promise.all([
    check.mediaHash ? findChecksByMediaHash(check.mediaHash) : [],
    vector ? similarChecksBefore(vector, check.createdAt, MIN_SIMILARITY) : [],
  ]);
  return Response.json(buildEvidenceView(check, sameMedia, similar));
}
