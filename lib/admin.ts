// Demo admin gate: one shared ADMIN_PASSWORD, and an HMAC-signed session cookie.
// Server-only. The signing key is derived from the password, so changing it logs everyone out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "cs_admin";
export const SESSION_SECONDS = 8 * 60 * 60;

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

// Hash both sides so timingSafeEqual always compares equal-length buffers.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(input: string, password = adminPassword()): boolean {
  if (!password) return false; // no password configured → nobody is admin
  return safeEqual(input, password);
}

function sign(payload: string, password: string): string {
  const key = createHash("sha256").update(`crisissignal-admin:${password}`).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(password = adminPassword(), now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${exp}.${sign(exp, password)}`;
}

export function verifySessionToken(token: string | undefined, password = adminPassword(), now = Date.now()): boolean {
  if (!token || !password) return false;
  const [exp, mac, ...rest] = token.split(".");
  if (!exp || !mac || rest.length > 0 || !/^\d+$/.test(exp)) return false;
  if (!safeEqual(mac, sign(exp, password))) return false;
  return Number(exp) > Math.floor(now / 1000);
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i !== -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function isAdminRequest(request: Request): boolean {
  return verifySessionToken(cookieValue(request.headers.get("cookie"), ADMIN_COOKIE));
}

// For admin route handlers: returns a 401 response to send, or null when the caller is an admin.
export function requireAdmin(request: Request): Response | null {
  if (isAdminRequest(request)) return null;
  return Response.json({ error: "Admin login required" }, { status: 401 });
}
