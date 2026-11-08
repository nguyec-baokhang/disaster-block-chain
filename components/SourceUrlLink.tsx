import { ExternalLink } from "lucide-react";

// Renders "Source: weather.gov" for http(s) URLs only.
export default function SourceUrlLink({ url }: { url: string }) {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.replace(/^(www|api)\./, "");
  } catch {
    return null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline"
    >
      Source: {host}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
