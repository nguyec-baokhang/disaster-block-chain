// Server-only: Tiger Data (Postgres + TimescaleDB) connection. Used by lib/store.ts when DATABASE_URL is set.
import { readFileSync } from "fs";
import { Pool } from "pg";

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

CREATE SEQUENCE IF NOT EXISTS alert_id_seq;
CREATE SEQUENCE IF NOT EXISTS check_id_seq;
`;
