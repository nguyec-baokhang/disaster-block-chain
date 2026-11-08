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

export async function nextAlertId(): Promise<string> {
  return nextId("AL", await readJson<Alert>(ALERTS_FILE));
}

export async function saveAlert(alert: Alert): Promise<Alert> {
  const alerts = await readJson<Alert>(ALERTS_FILE);
  const i = alerts.findIndex((a) => a.id === alert.id);
  if (i >= 0) alerts[i] = alert;
  else alerts.push(alert);
  await writeJson(ALERTS_FILE, alerts);
  return alert;
}

// Checks

export async function getCheck(id: string): Promise<CheckResult | undefined> {
  return (await readJson<CheckResult>(CHECKS_FILE)).find((c) => c.id === id);
}

export async function nextCheckId(): Promise<string> {
  return nextId("CK", await readJson<CheckResult>(CHECKS_FILE));
}

export async function saveCheck(check: CheckResult): Promise<CheckResult> {
  const checks = await readJson<CheckResult>(CHECKS_FILE);
  const i = checks.findIndex((c) => c.id === check.id);
  if (i >= 0) checks[i] = check;
  else checks.push(check);
  await writeJson(CHECKS_FILE, checks);
  return check;
}
