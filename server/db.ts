import { env, type D1Stmt } from './env.ts';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // Cached TMDB data. "data" is a compact Title snapshot, "details" the full page.
  `CREATE TABLE IF NOT EXISTS titles (
     key TEXT PRIMARY KEY, data TEXT NOT NULL, details TEXT, region TEXT, updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS watchlist (
     key TEXT PRIMARY KEY, section TEXT NOT NULL, added_at TEXT NOT NULL, added_by INTEGER, session_id TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS watched (
     key TEXT PRIMARY KEY, watched_at TEXT NOT NULL, rating1 REAL, rating2 REAL, session_id TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY, code TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, filters TEXT NOT NULL,
     created_at TEXT NOT NULL, completed_at TEXT, created_by INTEGER NOT NULL, first_player INTEGER NOT NULL, chosen_key TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS session_titles (
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, key TEXT NOT NULL, position INTEGER NOT NULL,
     PRIMARY KEY (session_id, key)
   )`,
  `CREATE TABLE IF NOT EXISTS votes (
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, player INTEGER NOT NULL, key TEXT NOT NULL,
     vote TEXT NOT NULL, voted_at TEXT NOT NULL, PRIMARY KEY (session_id, player, key)
   )`,
  `CREATE INDEX IF NOT EXISTS votes_key ON votes(key)`,
  `CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created_at)`,
];

let ready: Promise<void> | null = null;
/** Creates tables on first use, so deploying needs no separate migration step. */
export function ensureSchema(): Promise<void> {
  ready ??= env()
    .DB.batch(SCHEMA.map((s) => env().DB.prepare(s)))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : v));

export async function all<T>(sql: string, ...p: unknown[]): Promise<T[]> {
  return (await env().DB.prepare(sql).bind(...norm(p)).all<T>()).results;
}
export async function one<T>(sql: string, ...p: unknown[]): Promise<T | null> {
  return (await env().DB.prepare(sql).bind(...norm(p)).first<T>()) ?? null;
}
export async function run(sql: string, ...p: unknown[]): Promise<number> {
  const r = await env().DB.prepare(sql).bind(...norm(p)).run();
  return r.meta.changes ?? 0;
}
export const stmt = (sql: string, ...p: unknown[]): D1Stmt => env().DB.prepare(sql).bind(...norm(p));
export async function batch(stmts: D1Stmt[]) {
  // Keep batches modest; D1 caps statements per call.
  for (let i = 0; i < stmts.length; i += 50) await env().DB.batch(stmts.slice(i, i + 50));
}

export const placeholders = (n: number) => Array(n).fill('?').join(',');
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function kvAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const r of await all<{ key: string; value: string }>('SELECT key, value FROM kv')) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function kvSet(key: string, value: unknown) {
  await run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

/** Household settings used across requests. */
export interface Config {
  region: string;
  services: number[];
  resetAt: string;
}
export async function loadConfig(): Promise<Config> {
  const kv = await kvAll();
  return {
    region: (kv.region as string) ?? 'US',
    services: (kv.services as number[]) ?? [],
    resetAt: (kv.discoveryResetAt as string) ?? '1970-01-01',
  };
}
