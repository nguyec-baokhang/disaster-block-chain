// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAgency, getAgencyKeypair } from "@/lib/agencies";
import { transcribeVideo } from "@/lib/gemini";
import { sha256 } from "@/lib/hash";
import { MAX_BODY_CHARS, MAX_TITLE_CHARS } from "@/lib/limits";
import { PublishError, publishAlert } from "@/lib/publish";
import { listAlerts } from "@/lib/store";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

export async function GET() {
  await connection(); // reads local files — never prerender or cache
  return Response.json(await listAlerts());
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
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
  if (title.length > MAX_TITLE_CHARS || body.length > MAX_BODY_CHARS) {
    return Response.json(
      { error: `Title must be at most ${MAX_TITLE_CHARS} and body at most ${MAX_BODY_CHARS} characters` },
      { status: 413 },
    );
  }

  const videoField = form.get("video");
  const video = videoField instanceof File && videoField.size > 0 ? videoField : null;
  if (video && video.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Video must be under 20 MB" }, { status: 413 });
  }
  if (video && video.type && !video.type.startsWith("video/")) {
    return Response.json({ error: "Upload must be a video file" }, { status: 400 });
  }

  // Fail fast on agency/keypair problems before spending time on transcription.
  if (!getAgency(agencyId)) return Response.json({ error: `Unknown agency: ${agencyId}` }, { status: 400 });
  try {
    getAgencyKeypair(agencyId);
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

  try {
    const alert = await publishAlert({ agencyId, title, body, mediaHash, transcript });
    return Response.json(alert, { status: 201 });
  } catch (err) {
    if (err instanceof PublishError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
