// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { getAgency, getAgencyKeypair } from "@/lib/agencies";
import { contentHash } from "@/lib/hash";
import { explorerUrl, recordMemo } from "@/lib/solana";
import { createAlert, listAlerts, saveAlert } from "@/lib/store";
import type { Alert } from "@/lib/types";

export async function GET() {
  await connection(); // reads local files — never prerender or cache
  return Response.json(await listAlerts());
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const agencyId = String(form.get("agencyId") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!agencyId || !title || !body) {
    return Response.json({ error: "agencyId, title and body are required" }, { status: 400 });
  }

  const video = form.get("video");
  if (video instanceof File && video.size > 0) {
    // Needs transcribeVideo from lib/gemini.ts (Phase 3).
    return Response.json({ error: "Video publishing is not implemented yet" }, { status: 501 });
  }

  const agency = getAgency(agencyId);
  if (!agency) return Response.json({ error: `Unknown agency: ${agencyId}` }, { status: 400 });

  let keypair;
  try {
    keypair = getAgencyKeypair(agencyId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const issuedAt = new Date().toISOString();
  const pending = await createAlert((id) => ({
    id,
    agencyId,
    agencyName: agency.name,
    title,
    body,
    contentHash: contentHash({ agencyId, title, body, issuedAt }),
    signature: null,
    chainStatus: "pending",
    explorerUrl: null,
    issuedAt,
  }));

  let alert: Alert;
  try {
    const signature = await recordMemo(keypair, `crisissignal:v1:${pending.id}:${pending.contentHash}`);
    alert = { ...pending, signature, chainStatus: "confirmed", explorerUrl: explorerUrl(signature) };
  } catch (err) {
    console.error(`recordMemo failed for ${pending.id}:`, err);
    alert = { ...pending, signature: null, chainStatus: "failed", explorerUrl: null };
  }

  await saveAlert(alert);
  return Response.json(alert, { status: 201 });
}
