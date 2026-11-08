"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, FileVideoCamera, LoaderCircle, Search, X } from "lucide-react";
import { MAX_CHECK_TEXT_CHARS } from "@/lib/limits";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const STAGES = ["Checking official records…", "Searching sources…"];
const STAGE_MS = 6_000;

function errorMessage(status: number, apiError?: string): string {
  if (status === 504) return "That took too long. Please try again.";
  if (status === 413) return apiError ?? "That upload is too large.";
  return apiError ?? `Something went wrong (${status}). Please try again.`;
}

export default function CheckPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Advance the loading message while the request is running.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setStage(1), STAGE_MS);
    return () => clearTimeout(t);
  }, [loading]);

  function pickVideo(file: File | null) {
    setError(null);
    if (file && file.size > MAX_VIDEO_BYTES) {
      setError("That video is too large. Please use a clip under 20 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setVideo(file);
  }

  function clearVideo() {
    setVideo(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !video) return setError("Paste a message or choose a video to check.");
    if (trimmed && video) return setError("Check either the text or the video, not both. Clear one to continue.");

    const form = new FormData();
    if (video) form.append("video", video);
    else form.append("text", trimmed);

    setError(null);
    setStage(0);
    setLoading(true);
    try {
      const res = await fetch("/api/check", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(res.status, data?.error));
      router.push(`/result/${encodeURIComponent(data.id)}`);
    } catch (err) {
      const message = err instanceof TypeError ? "Couldn't reach the server. Please try again." : (err as Error).message;
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Check a message</h1>
      <p className="mt-2 text-slate-300">
        We compare it against official alerts anchored on Solana, then search credible sources.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-slate-200">
            Paste the message you received
          </label>
          <textarea
            id="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            rows={8}
            maxLength={MAX_CHECK_TEXT_CHARS}
            placeholder="e.g. URGENT: County says EVACUATE NOW, the water is poisoned!!"
            className="mt-2 w-full resize-y rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-200">Or upload a short video clip</span>
          <p className="text-sm text-slate-400">Under 20 MB, about a minute or less.</p>
          {video ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-navy-600 bg-navy-900 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-200">
                <FileVideoCamera className="h-4 w-4 shrink-0 text-sky-400" aria-hidden />
                <span className="truncate">{video.name}</span>
                <span className="shrink-0 text-slate-400">({(video.size / 1024 / 1024).toFixed(1)} MB)</span>
              </span>
              <button
                type="button"
                onClick={clearVideo}
                disabled={loading}
                aria-label="Remove video"
                className="rounded-md p-1 text-slate-400 hover:bg-navy-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-navy-600 bg-navy-900 px-4 py-4 text-sm text-slate-300 hover:border-sky-500/60 hover:text-slate-100">
              <FileVideoCamera className="h-4 w-4" aria-hidden />
              Choose a video
              <input
                ref={fileInput}
                type="file"
                accept="video/*"
                disabled={loading}
                onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-80 sm:w-auto"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {loading ? STAGES[stage] : "Check"}
        </button>
        {loading && (
          <p className="text-sm text-slate-400" aria-live="polite">
            {STAGES[stage]} This can take up to 45 seconds.
          </p>
        )}
      </form>
    </div>
  );
}
