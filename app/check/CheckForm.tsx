"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleX, FileVideoCamera, ImageIcon, Link as LinkIcon, LoaderCircle, Search, Type, X } from "lucide-react";
import { IMAGE_TYPES, MAX_CHECK_TEXT_CHARS, MAX_URL_CHARS, imageError } from "@/lib/limits";
import { saveThumbnail } from "@/lib/thumbnail";

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const STAGE_MS = 5_000;
const TIMEOUT_MS = 60_000;
const TIMEOUT_MESSAGE = "That took too long. Please try again.";

type Tab = "text" | "link" | "image" | "video";
const TABS: { id: Tab; label: string; icon: typeof Type }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "link", label: "Link", icon: LinkIcon },
  { id: "image", label: "Screenshot", icon: ImageIcon },
  { id: "video", label: "Video", icon: FileVideoCamera },
];
const CHECKING = ["Checking official records…", "Searching sources…"];
const STAGES: Record<Tab, string[]> = {
  text: CHECKING,
  link: ["Reading the page…", ...CHECKING],
  image: ["Reading the screenshot…", ...CHECKING],
  video: ["Watching the video…", ...CHECKING],
};

function errorMessage(status: number, apiError?: string): string {
  if (status === 504) return TIMEOUT_MESSAGE;
  if (status === 413) return apiError ?? "That upload is too large.";
  return apiError ?? `Something went wrong (${status}). Please try again.`;
}

// `loginNote` is rendered by the server page (it needs the session); null when Auth0 is off.
export default function CheckForm({ loginNote }: { loginNote: ReactNode }) {
  const router = useRouter();
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const stages = STAGES[tab];

  // Advance the loading message while the request is running; stay on the last stage.
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), STAGE_MS);
    return () => clearInterval(t);
  }, [loading, stages.length]);

  // The button must say "Check" whenever the page is shown. Next keeps this route's state alive while
  // you're on /result (Back or the nav link brings it back), and the browser's back-forward cache can
  // restore a frozen page, so reset on show and on hide, and cancel any request still running.
  useEffect(() => {
    const reset = () => {
      inFlight.current?.abort("reset");
      inFlight.current = null;
      setLoading(false);
      setStage(0);
      setError(null);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset();
    };
    reset();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      reset();
    };
  }, []);

  function pickVideo(file: File | null) {
    setError(null);
    if (file && file.size > MAX_VIDEO_BYTES) {
      setError("That video is too large. Please use a clip under 20 MB.");
      if (videoInput.current) videoInput.current.value = "";
      return;
    }
    setVideo(file);
  }

  function clearVideo() {
    setVideo(null);
    if (videoInput.current) videoInput.current.value = "";
  }

  function pickImage(file: File | null) {
    setError(null);
    const err = file && imageError(file.type, file.size);
    if (err) {
      setError(err);
      if (imageInput.current) imageInput.current.value = "";
      return;
    }
    setImage(file);
    setPreviewFor(file);
  }

  function clearImage() {
    setImage(null);
    setPreviewFor(null);
    if (imageInput.current) imageInput.current.value = "";
  }

  // Local preview of the chosen screenshot; the old blob URL is released when it changes.
  function setPreviewFor(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData();
    // Only the active tab's input is sent, so switching tabs never mixes inputs.
    if (tab === "text") {
      if (!text.trim()) return setError("Paste a message to check.");
      form.append("text", text.trim());
    } else if (tab === "link") {
      const trimmed = url.trim();
      if (!/^https?:\/\/\S+$/i.test(trimmed)) return setError("Paste a link that starts with http:// or https://");
      form.append("url", trimmed);
    } else if (tab === "image") {
      if (!image) return setError("Choose a screenshot to check.");
      form.append("image", image);
    } else {
      if (!video) return setError("Choose a video to check.");
      form.append("video", video);
    }

    setError(null);
    setStage(0);
    setLoading(true);
    const controller = new AbortController();
    inFlight.current = controller;
    const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
    try {
      const res = await fetch("/api/check", { method: "POST", body: form, signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(res.status, data?.error));
      if (tab === "image" && image) await saveThumbnail(data.id, image);
      if (controller.signal.aborted) return; // the page was left or reset meanwhile: don't navigate
      // Reset before leaving so a restored /check never shows a stale spinner.
      setLoading(false);
      setStage(0);
      router.push(`/result/${encodeURIComponent(data.id)}`);
    } catch (err) {
      if (controller.signal.reason === "reset") return; // cancelled by the page itself, not an error
      setLoading(false);
      setStage(0);
      if (controller.signal.reason === "timeout") setError(TIMEOUT_MESSAGE);
      else setError(err instanceof TypeError ? "Couldn't reach the server. Please try again." : (err as Error).message);
    } finally {
      clearTimeout(timer);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Check a message</h1>
      <p className="mt-2 text-slate-300">
        We compare it against official alerts anchored on Solana, then search credible sources.
      </p>
      {loginNote}

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div role="tablist" aria-label="What do you want to check?" className="grid grid-cols-4 gap-1 rounded-xl border border-navy-700 bg-navy-900 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="check-panel"
              disabled={loading}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-60 ${
                tab === id ? "bg-navy-700 text-slate-50" : "text-slate-400 hover:bg-navy-800 hover:text-slate-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" id="check-panel" aria-labelledby={`tab-${tab}`}>
          {tab === "text" && (
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
          )}

          {tab === "link" && (
            <div>
              <label htmlFor="link" className="block text-sm font-medium text-slate-200">
                Paste a link to an article or post
              </label>
              <p className="text-sm text-slate-400">We read the page, pull out what it claims, and check those claims.</p>
              <input
                id="link"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                maxLength={MAX_URL_CHARS}
                placeholder="https://"
                className="mt-2 w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
              />
            </div>
          )}

          {tab === "image" && (
            <div>
              <span className="block text-sm font-medium text-slate-200">Upload a screenshot</span>
              <p className="text-sm text-slate-400">A forwarded message, post or news graphic. PNG, JPG or WEBP under 10 MB.</p>
              {image ? (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-navy-600 bg-navy-900 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3 text-sm text-slate-200">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset
                      <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 shrink-0 text-sky-400" aria-hidden />
                    )}
                    <span className="truncate">{image.name}</span>
                    <span className="shrink-0 text-slate-400">({(image.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </span>
                  <button
                    type="button"
                    onClick={clearImage}
                    disabled={loading}
                    aria-label="Remove screenshot"
                    className="rounded-md p-1 text-slate-400 hover:bg-navy-800 hover:text-slate-100"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-navy-600 bg-navy-900 px-4 py-4 text-sm text-slate-300 hover:border-sky-500/60 hover:text-slate-100">
                  <ImageIcon className="h-4 w-4" aria-hidden />
                  Choose a screenshot
                  <input
                    ref={imageInput}
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    disabled={loading}
                    onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          )}

          {tab === "video" && (
            <div>
              <span className="block text-sm font-medium text-slate-200">Upload a short video clip</span>
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
                    ref={videoInput}
                    type="file"
                    accept="video/*"
                    disabled={loading}
                    onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
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
          {loading ? stages[stage] : "Check"}
        </button>
        {loading && (
          <p className="text-sm text-slate-400" aria-live="polite">
            {stages[stage]} This can take up to 45 seconds.
          </p>
        )}
      </form>
    </div>
  );
}
