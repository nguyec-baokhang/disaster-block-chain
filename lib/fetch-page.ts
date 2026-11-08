// Server-only: fetches a user-supplied URL without letting it reach internal services (SSRF).
// - only http/https, no credentials in the URL
// - every address a hostname resolves to must be public; the check runs inside the socket's DNS
//   lookup, so the IP that was checked is the IP that gets connected to (no DNS-rebinding gap)
// - IP-literal hosts are checked directly (Node skips the lookup for them)
// - 10 s total, 2 MB max (after decompression), at most 3 redirects, each re-checked
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { MAX_URL_CHARS } from "./limits";

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
const MAX_TEXT_CHARS = 20_000; // what we hand to Gemini
const TEXT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

// `message` is safe to show the user; `detail` is for logs.
export class LinkError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "LinkError";
  }
}

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (embeds an IPv4 address)
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net6, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").replace(/%.*$/, ""); // [::1], fe80::1%eth0
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible (::127.0.0.1) addresses: check the IPv4 part.
    const v4 = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return blocked.check(v4, "ipv4");
    const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return blocked.check([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."), "ipv4");
    }
    return blocked.check(ip, "ipv6");
  }
  return true; // not an IP at all: refuse
}

// Throws LinkError for anything we won't fetch. Hostnames are checked again at connect time.
export function validateUrl(raw: string): URL {
  const input = raw.trim();
  if (!input) throw new LinkError("Paste a link to check.");
  if (input.length > MAX_URL_CHARS) throw new LinkError("That link is too long.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new LinkError("That doesn't look like a link. It should start with http:// or https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new LinkError("Only http:// and https:// links can be checked.");
  if (url.username || url.password) throw new LinkError("Links with a username or password can't be checked.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new LinkError("That link has no host.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new LinkError("That link points to a private address.", host);
  }
  if (net.isIP(host) && isBlockedAddress(host)) throw new LinkError("That link points to a private address.", host);
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

// Drop-in for dns.lookup that refuses to hand the socket a private address.
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (list.length === 0 || bad) {
      const e = new LinkError("That link points to a private address.", `${hostname} → ${bad?.address ?? "no address"}`);
      return callback(e as NodeJS.ErrnoException, []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body?: Buffer };

function requestOnce(url: URL, signal: AbortSignal, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as unknown as http.RequestOptions["lookup"],
        signal,
        headers: {
          "user-agent": "CrisisSignalBot/1.0 (+fact-checking a link a user submitted)",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers });
        }
        const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new LinkError("Couldn't read that page.", `HTTP ${status}`));
        }
        if (type && !TEXT_TYPES.includes(type)) {
          res.resume();
          return reject(new LinkError("That link isn't a web page.", `content-type ${type}`));
        }
        if (Number(res.headers["content-length"] ?? 0) > maxBytes) {
          res.destroy();
          return reject(new LinkError("That page is too large.", `content-length ${res.headers["content-length"]}`));
        }

        // Count bytes after decompression, so a small gzip bomb can't blow past the limit.
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: Readable = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            stream.destroy();
            reject(new LinkError("That page is too large.", `over ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", (err) => reject(new LinkError("Couldn't read that page.", String(err))));
      },
    );
    req.on("error", (err) => reject(err instanceof LinkError ? err : new LinkError("Couldn't read that page.", String(err))));
    req.end();
  });
}

function decode(body: Buffer, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export type FetchedPage = { url: string; title: string; text: string };

export async function fetchPage(raw: string, opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {}): Promise<FetchedPage> {
  const { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_PAGE_BYTES, maxRedirects = MAX_REDIRECTS } = opts;
  const signal = AbortSignal.timeout(timeoutMs); // one budget across all redirects
  let url = validateUrl(raw);

  for (let redirects = 0; ; redirects++) {
    let res: RawResponse;
    try {
      res = await requestOnce(url, signal, maxBytes);
    } catch (err) {
      if (signal.aborted) throw new LinkError("That page took too long to load.", url.href);
      throw err;
    }
    if (!res.body) {
      const location = res.headers.location;
      if (!location) throw new LinkError("Couldn't read that page.", `HTTP ${res.status} without Location`);
      if (redirects >= maxRedirects) throw new LinkError("That link redirects too many times.", url.href);
      url = validateUrl(new URL(location, url).href); // re-check every hop
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "");
    const doc = decode(res.body, contentType);
    const page = contentType.toLowerCase().startsWith("text/plain") ? { title: "", text: doc } : htmlToText(doc);
    const text = page.text.slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) throw new LinkError("That page has no readable text.", url.href);
    return { url: url.href, title: page.title.slice(0, 300), text };
  }
}

// ---------- HTML → title + readable text (no dependencies; good enough for articles) ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

export function htmlToText(html: string): { title: string; text: string } {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i)?.[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(og ?? titleTag ?? "");

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head|iframe|form|nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " ");
  // Prefer the article itself when the page marks it up.
  const main = body.match(/<article\b[\s\S]*?<\/article\s*>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main\s*>/i)?.[0];
  if (main && clean(main.replace(/<[^>]+>/g, " ")).length > 200) body = main;

  const text = body
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");
  return { title, text };
}
