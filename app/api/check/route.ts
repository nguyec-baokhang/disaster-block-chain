// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { GeminiBudgetError, groundedCheck, matchAgainstAlerts, transcribeVideo } from "@/lib/gemini";
import { sha256 } from "@/lib/hash";
import { createCheck, listAlerts } from "@/lib/store";
import type { Alert, CheckResult } from "@/lib/types";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
// Total time for the whole request; each Gemini call gets whatever is left.
const BUDGET_MS = 45_000;
const MATCH_LIMITATION = "Matching against official alerts is done by AI and can make mistakes.";

type Draft = Omit<CheckResult, "id" | "createdAt">;

export async function POST(request: Request) {
  const deadline = Date.now() + BUDGET_MS;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const text = String(form.get("text") ?? "").trim();
  const videoField = form.get("video");
  const video = videoField instanceof File && videoField.size > 0 ? videoField : null;
  if (!!text === !!video) {
    return Response.json({ error: "Send exactly one of text or video" }, { status: 400 });
  }
  if (video && video.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Video must be under 20 MB" }, { status: 413 });
  }
  if (video && video.type && !video.type.startsWith("video/")) {
    return Response.json({ error: "Upload must be a video file" }, { status: 400 });
  }

  // Only alerts actually recorded on-chain count as official.
  const alerts = (await listAlerts()).filter((a) => a.chainStatus === "confirmed");

  let draft: Draft;
  try {
    draft = video ? await checkVideo(video, alerts, deadline) : await checkText(text, alerts, deadline);
  } catch (err) {
    console.error("check failed:", err);
    if (err instanceof GeminiBudgetError) {
      return Response.json({ error: "Check took too long. Please try again." }, { status: 504 });
    }
    return Response.json({ error: `Check failed: ${(err as Error).message}` }, { status: 502 });
  }

  const check = await createCheck((id) => ({ id, ...draft, createdAt: new Date().toISOString() }));
  return Response.json(check, { status: 201 });
}

async function checkVideo(video: File, alerts: Alert[], deadline: number): Promise<Draft> {
  const bytes = new Uint8Array(await video.arrayBuffer());

  // 1. Exact file match against a registered video.
  const hash = sha256(bytes);
  const exact = alerts.find((a) => a.mediaHash === hash);
  if (exact) {
    return {
      inputType: "video",
      verdict: "VERIFIED_OFFICIAL",
      basis: "exact_hash",
      summary: `This is the exact video file ${exact.agencyName} published with "${exact.title}".`,
      matchedAlert: exact,
      differences: [],
      sources: [],
      redFlags: [],
      limitations: [],
    };
  }

  const inputTranscript = await transcribeVideo(bytes, video.type || "video/mp4", deadline);
  return { inputType: "video", inputTranscript, ...(await checkContent(inputTranscript, alerts, deadline)) };
}

async function checkText(text: string, alerts: Alert[], deadline: number): Promise<Draft> {
  return { inputType: "text", inputText: text, ...(await checkContent(text, alerts, deadline)) };
}

// 2. Official match, then 3. grounded fallback.
async function checkContent(input: string, alerts: Alert[], deadline: number) {
  const match = await matchAgainstAlerts(input, alerts, deadline);
  const matchedAlert = alerts.find((a) => a.id === match.matchedAlertId);

  if (matchedAlert && match.relation !== "UNRELATED") {
    return {
      verdict: match.relation === "SAME" ? ("VERIFIED_OFFICIAL" as const) : ("CONTRADICTED" as const),
      basis: "official_match" as const,
      summary: match.summary,
      matchedAlert,
      differences: match.differences,
      sources: [],
      redFlags: match.redFlags,
      limitations: [MATCH_LIMITATION],
    };
  }

  const grounded = await groundedCheck(input, deadline);
  return {
    verdict: grounded.verdict,
    basis: grounded.sources.length > 0 ? ("web_sources" as const) : ("none" as const),
    summary: grounded.summary,
    differences: [],
    sources: grounded.sources,
    redFlags: [...new Set([...match.redFlags, ...grounded.redFlags])],
    limitations: grounded.limitations,
  };
}
