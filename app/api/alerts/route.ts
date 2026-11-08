// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { getAgency, getAgencyKeypair } from "@/lib/agencies";
import { transcribeVideo } from "@/lib/gemini";
import { contentHash, sha256 } from "@/lib/hash";
import { explorerUrl, recordMemo } from "@/lib/solana";
import { createAlert, listAlerts, saveAlert } from "@/lib/store";
import type { Alert } from "@/lib/types";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

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

  const videoField = form.get("video");
  const video = videoField instanceof File && videoField.size > 0 ? videoField : null;
  if (video && video.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Video must be under 20 MB" }, { status: 413 });
  }
  if (video && video.type && !video.type.startsWith("video/")) {
    return Response.json({ error: "Upload must be a video file" }, { status: 400 });
  }

  const agency = getAgency(agencyId);
  if (!agency) return Response.json({ error: `Unknown agency: ${agencyId}` }, { status: 400 });

  let keypair;
  try {
    keypair = getAgencyKeypair(agencyId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  let mediaHash: string | undefined;
  let transcript: string | undefined;
  if (video) {
    const bytes = new Uint8Array(await video.arrayBuffer());
    mediaHash = sha256(bytes);
    try {
      transcript = await transcribeVideo(bytes, video.type || "video/mp4");
    } catch (err) {
      return Response.json({ error: `Transcription failed: ${(err as Error).message}` }, { status: 502 });
    }
  }

  const issuedAt = new Date().toISOString();
  const pending = await createAlert((id) => ({
    id,
    agencyId,
    agencyName: agency.name,
    title,
    body,
    ...(transcript && { transcript }),
    ...(mediaHash && { mediaHash }),
    contentHash: contentHash({ agencyId, title, body, issuedAt, mediaHash }),
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
