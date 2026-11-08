// Server-only: Postgres implementation of lib/store.ts. Same behavior as the JSON store.
import { getPool } from "./db";
import { toVectorLiteral } from "./vector";
import type { LedgerFilters } from "./ledger";
import type { CheckStats, EmbeddingKind } from "./store";
import type { Alert, CheckResult, Verdict } from "./types";

// "AL-001" style IDs from a sequence, so concurrent requests never share one.
async function nextId(prefix: string, sequence: "alert_id_seq" | "check_id_seq"): Promise<string> {
  const { rows } = await getPool().query<{ n: string }>(`SELECT nextval('${sequence}') AS n`);
  return `${prefix}-${rows[0].n.padStart(3, "0")}`;
}

// Alerts

export async function listAlerts(): Promise<Alert[]> {
  const { rows } = await getPool().query<{ data: Alert }>(`SELECT data FROM alerts ORDER BY data->>'issuedAt' DESC`);
  return rows.map((r) => r.data);
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  const { rows } = await getPool().query<{ data: Alert }>(`SELECT data FROM alerts WHERE id = $1`, [id]);
  return rows[0]?.data;
}

export async function createAlert(make: (id: string) => Alert): Promise<Alert> {
  const alert = make(await nextId("AL", "alert_id_seq"));
  await getPool().query(`INSERT INTO alerts (id, data) VALUES ($1, $2)`, [alert.id, alert]);
  return alert;
}

export async function saveAlert(alert: Alert): Promise<Alert> {
  await getPool().query(
    `INSERT INTO alerts (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    [alert.id, alert],
  );
  return alert;
}

// Checks

export async function getCheck(id: string): Promise<CheckResult | undefined> {
  const { rows } = await getPool().query<{ data: CheckResult }>(`SELECT data FROM checks WHERE id = $1 LIMIT 1`, [id]);
  return rows[0]?.data;
}

export async function listChecks(filters: LedgerFilters, limit: number): Promise<CheckResult[]> {
  const { rows } = await getPool().query<{ data: CheckResult }>(
    `SELECT data FROM checks
     WHERE ($1::text IS NULL OR verdict = $1) AND ($2::text IS NULL OR data->>'inputType' = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [filters.verdict ?? null, filters.type ?? null, limit],
  );
  return rows.map((r) => r.data);
}

export async function saveCheck(check: CheckResult): Promise<CheckResult> {
  const res = await getPool().query(`UPDATE checks SET data = $2, verdict = $3 WHERE id = $1`, [check.id, check, check.verdict]);
  if (res.rowCount === 0) throw new Error(`Check not found: ${check.id}`);
  return check;
}

export async function listChecksByUser(userId: string): Promise<CheckResult[]> {
  const { rows } = await getPool().query<{ data: CheckResult }>(
    `SELECT data FROM checks WHERE data->>'userId' = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => r.data);
}

export async function createCheck(make: (id: string) => CheckResult): Promise<CheckResult> {
  const check = make(await nextId("CK", "check_id_seq"));
  await getPool().query(`INSERT INTO checks (id, data, verdict, created_at) VALUES ($1, $2, $3, $4)`, [
    check.id,
    check,
    check.verdict,
    check.createdAt,
  ]);
  return check;
}

// Stats: totals over all checks, hourly buckets over the last 24h.

export async function getCheckStats(): Promise<CheckStats> {
  const pool = getPool();
  const [totals, hourly] = await Promise.all([
    pool.query<{ verdict: Verdict; count: number }>(`SELECT verdict, count(*)::int AS count FROM checks GROUP BY verdict`),
    pool.query<{ bucket: Date; verdict: Verdict; count: number }>(
      `SELECT time_bucket('1 hour', created_at) AS bucket, verdict, count(*)::int AS count
       FROM checks
       WHERE created_at > now() - interval '24 hours'
       GROUP BY bucket, verdict
       ORDER BY bucket, verdict`,
    ),
  ]);
  const byVerdict: Partial<Record<Verdict, number>> = {};
  for (const r of totals.rows) byVerdict[r.verdict] = r.count;
  return {
    total: totals.rows.reduce((n, r) => n + r.count, 0),
    byVerdict,
    hourly: hourly.rows.map((r) => ({ bucket: r.bucket.toISOString(), verdict: r.verdict, count: r.count })),
  };
}

// Embeddings: the vector(768) column added by scripts/setup-db.ts.

const EMBED_TABLE = { alert: "alerts", check: "checks" } as const;

export async function saveEmbedding(kind: EmbeddingKind, id: string, vector: number[]): Promise<void> {
  await getPool().query(`UPDATE ${EMBED_TABLE[kind]} SET embedding = $2::vector WHERE id = $1`, [id, toVectorLiteral(vector)]);
}

export async function getEmbedding(kind: EmbeddingKind, id: string): Promise<number[] | undefined> {
  const { rows } = await getPool().query<{ embedding: string | null }>(
    `SELECT embedding::text AS embedding FROM ${EMBED_TABLE[kind]} WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0]?.embedding ? (JSON.parse(rows[0].embedding) as number[]) : undefined;
}
