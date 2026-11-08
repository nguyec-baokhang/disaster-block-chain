// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { PublicKey } from "@solana/web3.js";
import { getAgency } from "@/lib/agencies";
import {
  GeminiBudgetError,
  groundedCheck,
  matchAgainstAlerts,
  transcribeVideo,
  type MatchResult,
} from "@/lib/gemini";
import { sha256 } from "@/lib/hash";
import { MAX_CHECK_TEXT_CHARS } from "@/lib/limits";
import { alertPda, readAlertStatus } from "@/lib/registry";
import { createCheck, listAlerts, saveAlert } from "@/lib/store";
import type { Alert, CheckResult } from "@/lib/types";
import { isLocallyIntact } from "@/lib/verify";

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
  if (text.length > MAX_CHECK_TEXT_CHARS) {
    return Response.json({ error: `Text must be at most ${MAX_CHECK_TEXT_CHARS} characters` }, { status: 413 });
  }
  if (video && video.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Video must be under 20 MB" }, { status: 413 });
  }
  if (video && video.type && !video.type.startsWith("video/")) {
    return Response.json({ error: "Upload must be a video file" }, { status: 400 });
  }

  // Only alerts recorded on-chain, and not edited locally since, count as official.
  const alerts = (await listAlerts()).filter((a) => a.chainStatus === "confirmed" && isLocallyIntact(a));

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
    const live = await withLiveStatus(exact, alerts);
    return {
      inputType: "video",
      verdict: live.outdated ? "CONTRADICTED" : "VERIFIED_OFFICIAL",
      basis: "exact_hash",
      summary: live.outdated ?? `This is the exact video file ${exact.agencyName} published with "${exact.title}".`,
      matchedAlert: live.alert,
      differences: [],
      sources: [],
      redFlags: [],
      limitations: live.limitation ? [live.limitation] : [],
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
  let match: MatchResult;
  const fallbackLimitations: string[] = [];
  try {
    match = await matchAgainstAlerts(input, alerts, deadline);
  } catch (err) {
    if (err instanceof GeminiBudgetError) throw err;
    // Don't fail the whole check: fall through to the web source check instead.
    console.error("matchAgainstAlerts failed:", err);
    match = { matchedAlertId: null, relation: "UNRELATED", differences: [], redFlags: [], summary: "" };
    fallbackLimitations.push("We couldn't compare this against official alerts right now.");
  }
  const matchedAlert = alerts.find((a) => a.id === match.matchedAlertId);

  if (matchedAlert && match.relation !== "UNRELATED") {
    const live = await withLiveStatus(matchedAlert, alerts);
    // A retracted or replaced alert is never confirmation, even if the wording matches exactly.
    const verdict = match.relation === "SAME" && !live.outdated ? ("VERIFIED_OFFICIAL" as const) : ("CONTRADICTED" as const);
    return {
      verdict,
      basis: "official_match" as const,
      summary: live.outdated ?? match.summary,
      matchedAlert: live.alert,
      differences: match.differences,
      sources: [],
      redFlags: match.redFlags,
      limitations: live.limitation ? [MATCH_LIMITATION, live.limitation] : [MATCH_LIMITATION],
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
    limitations: [...fallbackLimitations, ...grounded.limitations],
  };
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });

// Anchor alerts can be retracted or superseded after publishing, so read the status live from the
// chain at check time (alert.registryStatus is only a cache, refreshed here).
async function withLiveStatus(
  alert: Alert,
  alerts: Alert[],
): Promise<{ alert: Alert; outdated?: string; limitation?: string }> {
  if (alert.chainRecord !== "anchor") return { alert };
  const agency = getAgency(alert.agencyId);
  if (!agency) return { alert };
  const authority = new PublicKey(agency.pubkey);

  let live;
  try {
    live = await readAlertStatus(authority, alert.contentHash);
  } catch (err) {
    console.error(`registry status read failed for ${alert.id}:`, err);
    return { alert, limitation: "Couldn't read this alert's current on-chain status, so it may since have been retracted or replaced." };
  }
  if (!live) return { alert, limitation: "No on-chain registry record was found for this alert." };

  const current = alert.registryStatus === live.status ? alert : await saveAlert({ ...alert, registryStatus: live.status });
  if (live.status === "Active") return { alert: current };

  const when = live.statusChangedAt ? ` on ${formatDate(live.statusChangedAt)}` : "";
  if (live.status === "Retracted") {
    return { alert: current, outdated: `${alert.agencyName} officially retracted this alert${when}. Don't act on it.` };
  }

  const replacement = alerts.find(
    (a) =>
      a.chainRecord === "anchor" &&
      a.agencyId === alert.agencyId &&
      /^[0-9a-f]{64}$/.test(a.contentHash) &&
      alertPda(authority, a.contentHash).toBase58() === live.supersededBy,
  );
  const follow = replacement
    ? ` Follow "${replacement.title}" (${replacement.id}) instead.`
    : " Follow the agency's current alert instead.";
  return {
    alert: current,
    outdated: `${alert.agencyName} replaced this alert with a newer one${when}, so this version is outdated.${follow}`,
  };
}
