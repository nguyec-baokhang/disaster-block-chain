// Server-only: uses the filesystem, or Postgres when DATABASE_URL is set. Do not import from client components.
import { promises as fs } from "fs";
import path from "path";
import { checksForUser } from "./checks";
import { dbEnabled } from "./db";
import { LEDGER_LIMIT, filterChecks, type LedgerFilters } from "./ledger";
import * as pg from "./store-pg";
import type { Alert, CheckResult, Verdict } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const CHECKS_FILE = path.join(DATA_DIR, "checks.json");
const EMBEDDINGS_FILE = path.join(DATA_DIR, "embeddings.json");

async function readJson<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeJson<T>(file: string, items: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write to a temp file then rename so a crash mid-write can't corrupt the store.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// Serialize read-modify-write cycles so concurrent requests can't clobber each other
// or hand out the same ID.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function nextId(prefix: string, items: { id: string }[]): string {
  const max = items.reduce((m, { id }) => {
    const n = Number(id.slice(prefix.length + 1));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// Alerts

export async function listAlerts(): Promise<Alert[]> {
  if (dbEnabled()) return pg.listAlerts();
  const alerts = await readJson<Alert>(ALERTS_FILE);
  return alerts.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  if (dbEnabled()) return pg.getAlert(id);
  return (await readJson<Alert>(ALERTS_FILE)).find((a) => a.id === id);
}

// Assigns the next ID and saves in one locked step.
export function createAlert(make: (id: string) => Alert): Promise<Alert> {
  if (dbEnabled()) return pg.createAlert(make);
  return locked(async () => {
    const alerts = await readJson<Alert>(ALERTS_FILE);
    const alert = make(nextId("AL", alerts));
    alerts.push(alert);
    await writeJson(ALERTS_FILE, alerts);
    return alert;
  });
}

export function saveAlert(alert: Alert): Promise<Alert> {
  if (dbEnabled()) return pg.saveAlert(alert);
  return locked(async () => {
    const alerts = await readJson<Alert>(ALERTS_FILE);
    const i = alerts.findIndex((a) => a.id === alert.id);
    if (i >= 0) alerts[i] = alert;
    else alerts.push(alert);
    await writeJson(ALERTS_FILE, alerts);
    return alert;
  });
}

// Checks

export async function getCheck(id: string): Promise<CheckResult | undefined> {
  if (dbEnabled()) return pg.getCheck(id);
  return (await readJson<CheckResult>(CHECKS_FILE)).find((c) => c.id === id);
}

// All checks for the public ledger, newest first. Callers must project with toLedgerEntry before display.
export async function listChecks(filters: LedgerFilters = {}, limit = LEDGER_LIMIT): Promise<CheckResult[]> {
  if (dbEnabled()) return pg.listChecks(filters, limit);
  return filterChecks(await readJson<CheckResult>(CHECKS_FILE), filters, limit);
}

// A logged-in user's own checks, newest first.
export async function listChecksByUser(userId: string): Promise<CheckResult[]> {
  if (!userId) return [];
  if (dbEnabled()) return pg.listChecksByUser(userId);
  return checksForUser(await readJson<CheckResult>(CHECKS_FILE), userId);
}

// Updates a stored check (the on-chain log fills in chainSignature/chainStatus after the fact).
export function saveCheck(check: CheckResult): Promise<CheckResult> {
  if (dbEnabled()) return pg.saveCheck(check);
  return locked(async () => {
    const checks = await readJson<CheckResult>(CHECKS_FILE);
    const i = checks.findIndex((c) => c.id === check.id);
    if (i < 0) throw new Error(`Check not found: ${check.id}`);
    checks[i] = check;
    await writeJson(CHECKS_FILE, checks);
    return check;
  });
}

// Assigns the next ID and saves in one locked step.
export function createCheck(make: (id: string) => CheckResult): Promise<CheckResult> {
  if (dbEnabled()) return pg.createCheck(make);
  return locked(async () => {
    const checks = await readJson<CheckResult>(CHECKS_FILE);
    const check = make(nextId("CK", checks));
    checks.push(check);
    await writeJson(CHECKS_FILE, checks);
    return check;
  });
}

// Stats

export type CheckStats = {
  total: number;
  byVerdict: Partial<Record<Verdict, number>>;
  hourly: { bucket: string; verdict: Verdict; count: number }[]; // last 24h, 1-hour buckets
};

export async function getCheckStats(): Promise<CheckStats> {
  if (dbEnabled()) return pg.getCheckStats();
  return computeCheckStats(await readJson<CheckResult>(CHECKS_FILE));
}

// JSON fallback for the Postgres time_bucket() query in store-pg.ts.
export function computeCheckStats(checks: Pick<CheckResult, "verdict" | "createdAt">[], now = Date.now()): CheckStats {
  const HOUR = 60 * 60 * 1000;
  const byVerdict: Partial<Record<Verdict, number>> = {};
  const buckets = new Map<string, { bucket: string; verdict: Verdict; count: number }>();
  for (const c of checks) {
    byVerdict[c.verdict] = (byVerdict[c.verdict] ?? 0) + 1;
    const t = Date.parse(c.createdAt);
    if (!(t > now - 24 * HOUR)) continue;
    const bucket = new Date(Math.floor(t / HOUR) * HOUR).toISOString();
    const key = `${bucket} ${c.verdict}`;
    const b = buckets.get(key) ?? { bucket, verdict: c.verdict, count: 0 };
    b.count++;
    buckets.set(key, b);
  }
  const hourly = [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.verdict.localeCompare(b.verdict));
  return { total: checks.length, byVerdict, hourly };
}

// Embeddings (kept apart from alerts/checks so API responses never carry 768 floats)

export type EmbeddingKind = "alert" | "check";
type EmbeddingFile = { alerts: Record<string, number[]>; checks: Record<string, number[]> };

async function readEmbeddings(): Promise<EmbeddingFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(EMBEDDINGS_FILE, "utf8")) as Partial<EmbeddingFile>;
    return { alerts: parsed.alerts ?? {}, checks: parsed.checks ?? {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { alerts: {}, checks: {} };
    throw err;
  }
}

export function saveEmbedding(kind: EmbeddingKind, id: string, vector: number[]): Promise<void> {
  if (dbEnabled()) return pg.saveEmbedding(kind, id, vector);
  return locked(async () => {
    const all = await readEmbeddings();
    all[kind === "alert" ? "alerts" : "checks"][id] = vector;
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${EMBEDDINGS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all), "utf8");
    await fs.rename(tmp, EMBEDDINGS_FILE);
  });
}

export async function getEmbedding(kind: EmbeddingKind, id: string): Promise<number[] | undefined> {
  if (dbEnabled()) return pg.getEmbedding(kind, id);
  return (await readEmbeddings())[kind === "alert" ? "alerts" : "checks"][id];
}
