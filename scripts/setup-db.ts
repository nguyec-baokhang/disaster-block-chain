// Creates the Tiger Data tables (checks as a TimescaleDB hypertable), imports data/*.json, adds pgvector
// embedding columns + index, and backfills missing embeddings with Gemini.
// Safe to re-run: existing rows are left alone and the ID sequences only move forward.
// Usage: npx tsx --env-file=.env.local scripts/setup-db.ts
import { promises as fs } from "fs";
import path from "path";
import { SCHEMA_SQL, ensureVectorSchema, getPool } from "../lib/db";
import { alertEmbeddingText, checkEmbeddingText, embed } from "../lib/embed";
import { SAME_CLAIM_SIMILARITY } from "../lib/rag";
import { cosineSimilarity, toVectorLiteral } from "../lib/vector";
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

  const { vectorscale, indexes } = await ensureVectorSchema(pool);
  console.log(`Vectors: pgvector ready, vectorscale ${vectorscale ? "on" : "off"}, index alerts=${indexes.alerts} checks=${indexes.checks}.`);

  // Backfill only rows still missing an embedding, so re-runs just pick up what failed before.
  for (const table of ["alerts", "checks"] as const) {
    const { rows } = await pool.query<{ id: string; data: Alert & CheckResult }>(
      `SELECT DISTINCT ON (id) id, data FROM ${table} WHERE embedding IS NULL ORDER BY id`,
    );
    let done = 0;
    let skipped = 0;
    for (const r of rows) {
      const text = table === "alerts" ? alertEmbeddingText(r.data) : checkEmbeddingText(r.data);
      const vector = await embed(text);
      if (!vector) {
        skipped++;
        continue;
      }
      await pool.query(`UPDATE ${table} SET embedding = $2::vector WHERE id = $1`, [r.id, toVectorLiteral(vector)]);
      done++;
    }
    console.log(`Embeddings for ${table}: ${done} added, ${skipped} skipped (no text or embedding failed).`);
  }

  // Claim clusters for checks saved before clustering existed: oldest first, join the first earlier check of
  // the same media file or a near-identical claim, else start a cluster. Rows that have a claimId are kept.
  const { rows: all } = await pool.query<{ id: string; data: CheckResult; embedding: string | null }>(
    `SELECT DISTINCT ON (id) id, data, embedding::text AS embedding FROM checks ORDER BY id, created_at`,
  );
  all.sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));
  const seen: { id: string; claimId: string; mediaHash?: string; vector: number[] | null }[] = [];
  let clustered = 0;
  for (const r of all) {
    const vector = r.embedding ? (JSON.parse(r.embedding) as number[]) : null;
    let claimId = r.data.claimId;
    if (!claimId) {
      const same =
        seen.find((s) => r.data.mediaHash && s.mediaHash === r.data.mediaHash) ??
        (vector ? seen.find((s) => s.vector && cosineSimilarity(vector, s.vector) >= SAME_CLAIM_SIMILARITY) : undefined);
      claimId = same?.claimId ?? r.id;
      await pool.query(`UPDATE checks SET data = jsonb_set(data, '{claimId}', to_jsonb($2::text)) WHERE id = $1`, [r.id, claimId]);
      clustered++;
    }
    seen.push({ id: r.id, claimId, mediaHash: r.data.mediaHash, vector });
  }
  console.log(`Claim clusters: ${clustered} checks assigned, ${new Set(seen.map((s) => s.claimId)).size} clusters in total.`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
