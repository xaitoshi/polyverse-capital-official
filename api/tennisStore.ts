import { readFile } from "node:fs/promises";
import path from "node:path";

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

let schemaReady = false;

export async function ensureSchema(db: Db): Promise<void> {
  if (schemaReady) return;
  const sql = await readFile(path.join(process.cwd(), "db/tennis/001_init.sql"), "utf8");
  await db.query(sql);
  schemaReady = true;
}

export function cronAuthorized(header: string | string[] | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${secret}`;
}
