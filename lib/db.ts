// Server-only: Tiger Data (Postgres + TimescaleDB) connection. Used by lib/store.ts when DATABASE_URL is set.
import { readFileSync } from "fs";
import { Pool } from "pg";
import { EMBED_DIMENSIONS } from "./vector";

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// One pool per process; survives dev hot reloads.
const globalForDb = globalThis as unknown as { crisisPool?: Pool };

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // SSL is always on and the certificate is always verified. Tiger Data signs with its own CA
  // (ca.timescale.com), so point DATABASE_CA_CERT at that PEM file. pg lets URL ssl params
  // override the `ssl` option, so drop them and set it here.
  const url = new URL(process.env.DATABASE_URL);
  for (const p of ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(p);
  const caFile = process.env.DATABASE_CA_CERT;
  globalForDb.crisisPool ??= new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}) },
    max: 5,
  });
  return globalForDb.crisisPool;
}

// Idempotent; run by scripts/setup-db.ts.
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS alerts (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
  id text NOT NULL,
  data jsonb NOT NULL,
  verdict text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
SELECT create_hypertable('checks', by_range('created_at'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS checks_id_idx ON checks (id);
CREATE INDEX IF NOT EXISTS checks_user_idx ON checks ((data->>'userId'), created_at DESC);

CREATE SEQUENCE IF NOT EXISTS alert_id_seq;
CREATE SEQUENCE IF NOT EXISTS check_id_seq;
`;

// pgvector columns + an ANN index on each table. Prefers pgvectorscale's diskann index, falls back to
// pgvector's HNSW when the extension (or diskann on a hypertable) isn't available. Idempotent.
export async function ensureVectorSchema(pool: Pool): Promise<{ vectorscale: boolean; indexes: Record<string, string> }> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  let vectorscale = false;
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE`);
    vectorscale = true;
  } catch (err) {
    console.warn("vectorscale not available, using HNSW:", (err as Error).message);
  }

  const indexes: Record<string, string> = {};
  for (const table of ["alerts", "checks"]) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS embedding vector(${EMBED_DIMENSIONS})`);
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
      [table, `${table}_embedding_idx`],
    );
    if (rows[0]) {
      indexes[table] = /diskann/i.test(rows[0].indexdef) ? "diskann" : "hnsw";
      continue;
    }
    if (vectorscale) {
      try {
        await pool.query(`CREATE INDEX ${table}_embedding_idx ON ${table} USING diskann (embedding vector_cosine_ops)`);
        indexes[table] = "diskann";
        continue;
      } catch (err) {
        console.warn(`diskann index on ${table} failed, using HNSW:`, (err as Error).message);
      }
    }
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_embedding_idx ON ${table} USING hnsw (embedding vector_cosine_ops)`);
    indexes[table] = "hnsw";
  }
  return { vectorscale, indexes };
}
