// Which grounding sources we show: no social/video platforms, one per domain, at most 6.
// Safe to import from client components.
import type { Source } from "./types";

export const MAX_SOURCES = 6;
const BLOCKED = ["youtube.com", "youtu.be", "tiktok.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "reddit.com"];
// Gemini grounding URIs are redirects through this host; the real site's domain is in the title.
const GROUNDING_REDIRECT = "vertexaisearch.cloud.google.com";

const clean = (host: string) => host.trim().toLowerCase().replace(/\.$/, "").replace(/^(www|m|mobile)\./, "");

export function sourceDomain(s: Source): string | null {
  let host = "";
  try {
    host = new URL(s.uri).hostname;
  } catch {
    return null;
  }
  if (host === GROUNDING_REDIRECT) {
    const title = clean(s.title);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(title) ? title : null;
  }
  return clean(host);
}

export function isBlockedDomain(domain: string): boolean {
  return BLOCKED.some((b) => domain === b || domain.endsWith(`.${b}`));
}

// Keeps the first source per domain. Sources whose domain can't be told are kept (can't dedupe or block them).
export function filterSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const domain = sourceDomain(s);
    if (domain && (isBlockedDomain(domain) || seen.has(domain))) continue;
    if (domain) seen.add(domain);
    out.push(s);
    if (out.length === MAX_SOURCES) break;
  }
  return out;
}

// Older checks stored Gemini-written limitations; hide the first-person ones ("I could not…").
export function isFirstPerson(line: string): boolean {
  // "I" as a word (not "I-75"), "I'm/I've/I'd/I'll", "my", "me".
  return /(?<![\w-])I(?=\s|'(?:m|ve|d|ll)\b)/.test(line) || /\b(?:[Mm]y|me)\b/.test(line);
}
