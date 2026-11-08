// Server-only: uses the filesystem. Do not import from client components.
import { promises as fs } from "fs";
import path from "path";
import type { Alert, CheckResult } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const CHECKS_FILE = path.join(DATA_DIR, "checks.json");

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
  const alerts = await readJson<Alert>(ALERTS_FILE);
  return alerts.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  return (await readJson<Alert>(ALERTS_FILE)).find((a) => a.id === id);
}

// Assigns the next ID and saves in one locked step.
export function createAlert(make: (id: string) => Alert): Promise<Alert> {
  return locked(async () => {
    const alerts = await readJson<Alert>(ALERTS_FILE);
    const alert = make(nextId("AL", alerts));
    alerts.push(alert);
    await writeJson(ALERTS_FILE, alerts);
    return alert;
  });
}

export function saveAlert(alert: Alert): Promise<Alert> {
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
  return (await readJson<CheckResult>(CHECKS_FILE)).find((c) => c.id === id);
}

// Assigns the next ID and saves in one locked step.
export function createCheck(make: (id: string) => CheckResult): Promise<CheckResult> {
  return locked(async () => {
    const checks = await readJson<CheckResult>(CHECKS_FILE);
    const check = make(nextId("CK", checks));
    checks.push(check);
    await writeJson(CHECKS_FILE, checks);
    return check;
  });
}
