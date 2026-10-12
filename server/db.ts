import './quiet.ts';
import { createRequire } from 'node:module';
import type { DatabaseSync as DB } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Loaded at runtime (not via import) so quiet.ts can filter its experimental warning first.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DB };

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH ?? path.join(dataDir, 'moviematch.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Cached TMDB data. "data" is a compact Title snapshot, "details" the full page.
  CREATE TABLE IF NOT EXISTS titles (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    details    TEXT,
    region     TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    key        TEXT PRIMARY KEY,
    section    TEXT NOT NULL,
    added_at   TEXT NOT NULL,
    added_by   INTEGER,
    session_id TEXT
  );

  CREATE TABLE IF NOT EXISTS watched (
    key        TEXT PRIMARY KEY,
    watched_at TEXT NOT NULL,
    rating1    REAL,
    rating2    REAL,
    session_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    code         TEXT NOT NULL,
    mode         TEXT NOT NULL,
    status       TEXT NOT NULL,
    filters      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    completed_at TEXT,
    created_by   INTEGER NOT NULL,
    first_player INTEGER NOT NULL,
    chosen_key   TEXT
  );

  CREATE TABLE IF NOT EXISTS session_titles (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    position   INTEGER NOT NULL,
    PRIMARY KEY (session_id, key)
  );

  CREATE TABLE IF NOT EXISTS votes (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    player     INTEGER NOT NULL,
    key        TEXT NOT NULL,
    vote       TEXT NOT NULL,
    voted_at   TEXT NOT NULL,
    PRIMARY KEY (session_id, player, key)
  );

  CREATE INDEX IF NOT EXISTS votes_key ON votes(key);
  CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created_at);
`);

export function kvGet<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function kvSet(key: string, value: unknown) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
