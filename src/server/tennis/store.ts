export interface Db {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

let pool: Db | null = null;

export async function getDb(): Promise<Db | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (pool) return pool;
  const mod = (await import("pg")) as {
    Pool?: new (opts: unknown) => Db;
    default?: { Pool?: new (opts: unknown) => Db };
  };
  const PoolCtor = mod.Pool ?? mod.default?.Pool;
  if (!PoolCtor) throw new Error("pg Pool export missing");
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
  pool = new PoolCtor({ connectionString: url, max: 1, ssl });
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tennis_matches (
  id TEXT PRIMARY KEY,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tennis_matches_start_idx ON tennis_matches (start_time);
CREATE TABLE IF NOT EXISTS tennis_picks (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  picked_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS tennis_results (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  settled_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
`;

let schemaReady = false;

export async function ensureSchema(db: Db): Promise<void> {
  if (schemaReady) return;
  await db.query(SCHEMA_SQL);
  schemaReady = true;
}

export function cronAuthorized(header: string | string[] | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${secret}`;
}
