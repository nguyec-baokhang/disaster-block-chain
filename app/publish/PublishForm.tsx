"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleX, FileVideoCamera, LoaderCircle, Send, X } from "lucide-react";
import AlertCard from "@/components/AlertCard";
import type { Agency, Alert } from "@/lib/types";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const inputClass =
  "mt-2 w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60";

function errorMessage(status: number, apiError?: string): string {
  if (status === 413) return "That video is too large. Please use a clip under 20 MB.";
  return apiError ?? `Something went wrong (${status}). Please try again.`;
}

export default function PublishForm({ agencies }: { agencies: Agency[] }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [agencyId, setAgencyId] = useState(agencies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<Alert | null>(null);

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

  function reset() {
    setTitle("");
    setBody("");
    clearVideo();
    setPublished(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyId || !title.trim() || !body.trim()) return setError("Choose an agency and fill in the title and body.");

    const form = new FormData();
    form.append("agencyId", agencyId);
    form.append("title", title.trim());
    form.append("body", body.trim());
    if (video) form.append("video", video);

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/alerts", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(res.status, data?.error));
      setPublished(data as Alert);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Please try again." : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (published) {
    const confirmed = published.chainStatus === "confirmed";
    return (
      <div className="mt-8 space-y-5">
        <p
          role="status"
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            confirmed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {confirmed ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {confirmed
            ? "Published and signed on Solana."
            : "The alert was saved, but the Solana transaction failed, so it is not an official record. Check the wallet's Devnet SOL balance and try again."}
        </p>
        <AlertCard alert={published} preview={false} />
        <div className="flex flex-wrap gap-3">
          <Link
            href="/alerts"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500"
          >
            View all alerts
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-navy-600 bg-navy-800 px-5 py-3 font-medium text-slate-100 hover:bg-navy-700"
          >
            Publish another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="agency" className="block text-sm font-medium text-slate-200">
          Agency
        </label>
        <select
          id="agency"
          value={agencyId}
          onChange={(e) => setAgencyId(e.target.value)}
          disabled={loading}
          className={inputClass}
        >
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-200">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="Boil Water Advisory"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="body" className="block text-sm font-medium text-slate-200">
          Alert text
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={loading}
          rows={6}
          placeholder="Residents of Green Township should boil tap water for 1 minute before drinking until further notice."
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-200">Optional video</span>
        <p className="text-sm text-slate-400">A short official clip, under 20 MB.</p>
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
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        {loading ? "Signing on Solana…" : "Publish"}
      </button>
      {loading && video && (
        <p className="text-sm text-slate-400" aria-live="polite">
          Transcribing the video first, so this can take up to a minute.
        </p>
      )}
    </form>
  );
}
