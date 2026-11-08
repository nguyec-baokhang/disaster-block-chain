// Creates the Tiger Data tables (checks as a TimescaleDB hypertable) and imports data/*.json.
// Safe to re-run: existing rows are left alone and the ID sequences only move forward.
// Usage: npx tsx --env-file=.env.local scripts/setup-db.ts
import { promises as fs } from "fs";
import path from "path";
import { SCHEMA_SQL, getPool } from "../lib/db";
import type { Alert, CheckResult } from "../lib/types";

async function readJson<T>(name: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", name), "utf8")) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function idNumber(id: string): number {
  const n = Number(id.split("-")[1]);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const pool = getPool();
  await pool.query(SCHEMA_SQL);
  console.log("Schema ready (alerts, checks hypertable, ID sequences).");

  const alerts = await readJson<Alert>("alerts.json");
  let added = 0;
  for (const a of alerts) {
    const res = await pool.query(
      `INSERT INTO alerts (id, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [a.id, a, a.issuedAt],
    );
    added += res.rowCount ?? 0;
  }
  console.log(`Alerts: ${added} imported, ${alerts.length - added} already present.`);

  const checks = await readJson<CheckResult>("checks.json");
  added = 0;
  for (const c of checks) {
    const res = await pool.query(
      `INSERT INTO checks (id, data, verdict, created_at)
       SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM checks WHERE id = $1)`,
      [c.id, c, c.verdict, c.createdAt],
    );
    added += res.rowCount ?? 0;
  }
  console.log(`Checks: ${added} imported, ${checks.length - added} already present.`);

  // Point each sequence past the highest existing ID so new IDs continue the series.
  for (const [table, sequence] of [["alerts", "alert_id_seq"], ["checks", "check_id_seq"]] as const) {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM ${table}`);
    const max = rows.reduce((m, r) => Math.max(m, idNumber(r.id)), 0);
    if (max > 0) await pool.query(`SELECT setval('${sequence}', GREATEST($1::bigint, (SELECT last_value FROM ${sequence})))`, [max]);
    console.log(`${sequence}: next ID after ${max}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
