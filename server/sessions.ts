import crypto from 'node:crypto';
import { db, tx } from './db.ts';
import { getTitles } from './tmdb.ts';
import { buildDeck } from './deck.ts';
import type {
  PlayerId,
  Progress,
  SessionDetail,
  SessionFilters,
  SessionMode,
  SessionResults,
  SessionStatus,
  SessionSummary,
  Title,
  Vote,
} from '../shared/types.ts';
import { DEFAULT_FILTERS, classifyMatch } from '../shared/types.ts';

interface SessionRow {
  id: string;
  code: string;
  mode: SessionMode;
  status: SessionStatus;
  filters: string;
  created_at: string;
  completed_at: string | null;
  created_by: PlayerId;
  first_player: PlayerId;
  chosen_key: string | null;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    const clash = db.prepare("SELECT 1 FROM sessions WHERE code = ? AND status = 'swiping'").get(code);
    if (!clash) return code;
  }
}

const deckKeys = (id: string) =>
  (db.prepare('SELECT key FROM session_titles WHERE session_id = ? ORDER BY position').all(id) as { key: string }[]).map((r) => r.key);

function votesFor(id: string) {
  const rows = db.prepare('SELECT player, key, vote FROM votes WHERE session_id = ?').all(id) as { player: PlayerId; key: string; vote: Vote }[];
  const map: Record<string, Partial<Record<PlayerId, Vote>>> = {};
  for (const r of rows) (map[r.key] ??= {})[r.player] = r.vote;
  return map;
}

function computeResults(keys: string[], votes: SessionResults['votes'], titles: Record<string, Title>): SessionResults {
  const perfect: string[] = [];
  const possible: { key: string; score: number }[] = [];
  for (const k of keys) {
    const v = votes[k] ?? {};
    const m = classifyMatch(v[1], v[2]);
    if (m === 'perfect') perfect.push(k);
    else if (m === 'possible') possible.push({ key: k, score: (v[1] === 'yes' ? 1 : 0) + (v[2] === 'yes' ? 1 : 0) });
  }
  const rating = (k: string) => titles[k]?.rating ?? 0;
  perfect.sort((a, b) => rating(b) - rating(a));
  possible.sort((a, b) => b.score - a.score || rating(b.key) - rating(a.key));
  // Only include votes for titles in the deck.
  const scoped: SessionResults['votes'] = {};
  for (const k of keys) scoped[k] = votes[k] ?? {};
  return { votes: scoped, perfect, possible: possible.map((p) => p.key) };
}

function progressOf(keys: string[], votes: SessionResults['votes']): Record<PlayerId, Progress> {
  const count = (p: PlayerId) => keys.filter((k) => votes[k]?.[p]).length;
  return { 1: { done: count(1), total: keys.length }, 2: { done: count(2), total: keys.length } };
}

async function summarize(row: SessionRow, withTitles = false): Promise<SessionSummary & { titles?: Record<string, Title>; votes: SessionResults['votes']; keys: string[] }> {
  const keys = deckKeys(row.id);
  const votes = votesFor(row.id);
  const complete = row.status === 'complete';
  const titles = await getTitles(withTitles ? keys : complete ? keys : keys.slice(0, 4));
  const results = complete ? computeResults(keys, votes, titles) : null;
  const previewKeys = results ? [...results.perfect, ...results.possible, ...keys].slice(0, 4) : keys.slice(0, 4);
  return {
    id: row.id,
    code: row.code,
    mode: row.mode,
    status: row.status,
    filters: { ...DEFAULT_FILTERS, ...JSON.parse(row.filters) },
    createdAt: row.created_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    firstPlayer: row.first_player,
    chosenKey: row.chosen_key,
    deckSize: keys.length,
    progress: progressOf(keys, votes),
    perfectKeys: results?.perfect ?? [],
    possibleKeys: results?.possible ?? [],
    posterPreview: [...new Set(previewKeys)].slice(0, 4).map((k) => titles[k]?.poster ?? null),
    titles,
    votes,
    keys,
  };
}

function getRow(id: string): SessionRow {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) throw new HttpError(404, 'Movie night not found');
  return row;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 200').all() as unknown as SessionRow[];
  const out: SessionSummary[] = [];
  for (const r of rows) {
    const { titles: _t, votes: _v, keys: _k, ...s } = await summarize(r);
    out.push(s);
  }
  return out;
}

export async function activeSessions(): Promise<SessionSummary[]> {
  // Nights older than two days are treated as abandoned (they stay in history).
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare("SELECT * FROM sessions WHERE status = 'swiping' AND created_at > ? ORDER BY created_at DESC LIMIT 5")
    .all(since) as unknown as SessionRow[];
  const out: SessionSummary[] = [];
  for (const r of rows) {
    const { titles: _t, votes: _v, keys: _k, ...s } = await summarize(r);
    out.push(s);
  }
  return out;
}

export async function getSession(id: string): Promise<SessionDetail> {
  const row = getRow(id);
  const { titles, votes, keys, ...summary } = await summarize(row, true);
  return {
    ...summary,
    deck: keys.map((k) => titles![k]).filter(Boolean),
    votedKeys: { 1: keys.filter((k) => votes[k]?.[1]), 2: keys.filter((k) => votes[k]?.[2]) },
    // Votes stay secret until both players are done.
    results: row.status === 'complete' ? computeResults(keys, votes, titles!) : null,
  };
}

export function findByCode(code: string): string {
  const row = db
    .prepare("SELECT id FROM sessions WHERE code = ? ORDER BY CASE status WHEN 'swiping' THEN 0 ELSE 1 END, created_at DESC LIMIT 1")
    .get(code.trim().toUpperCase()) as { id: string } | undefined;
  if (!row) throw new HttpError(404, 'No movie night with that code');
  return row.id;
}

export async function createSession(input: { mode: SessionMode; filters: Partial<SessionFilters>; createdBy: PlayerId; firstPlayer: PlayerId }): Promise<string> {
  const filters: SessionFilters = { ...DEFAULT_FILTERS, ...input.filters };
  filters.size = Math.max(5, Math.min(50, Math.round(filters.size || 20)));
  const deck = await buildDeck(filters, filters.size);
  if (!deck.length) {
    throw new HttpError(
      422,
      filters.source === 'watchlist'
        ? 'Your watchlist has nothing left to swipe on yet. Add a few titles first.'
        : 'No titles matched those filters. Try loosening them a little.',
    );
  }
  const id = crypto.randomUUID();
  tx(() => {
    db.prepare(
      'INSERT INTO sessions (id, code, mode, status, filters, created_at, created_by, first_player) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, newCode(), input.mode, 'swiping', JSON.stringify(filters), new Date().toISOString(), input.createdBy, input.firstPlayer);
    const ins = db.prepare('INSERT INTO session_titles (session_id, key, position) VALUES (?, ?, ?)');
    deck.forEach((t, i) => ins.run(id, t.key, i));
  });
  return id;
}

function refreshStatus(id: string) {
  const keys = deckKeys(id);
  const votes = votesFor(id);
  const p = progressOf(keys, votes);
  const complete = keys.length > 0 && p[1].done >= keys.length && p[2].done >= keys.length;
  const row = getRow(id);
  if (complete && row.status !== 'complete') {
    db.prepare("UPDATE sessions SET status = 'complete', completed_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  } else if (!complete && row.status === 'complete') {
    db.prepare("UPDATE sessions SET status = 'swiping', completed_at = NULL WHERE id = ?").run(id);
  }
}

export function castVote(id: string, player: PlayerId, key: string, vote: Vote) {
  const row = getRow(id);
  if (row.status === 'complete') throw new HttpError(409, 'This movie night is already finished');
  if (!db.prepare('SELECT 1 FROM session_titles WHERE session_id = ? AND key = ?').get(id, key)) throw new HttpError(400, 'Title is not in this movie night');
  db.prepare(
    `INSERT INTO votes (session_id, player, key, vote, voted_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, player, key) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`,
  ).run(id, player, key, vote, new Date().toISOString());
  refreshStatus(id);
}

export function undoVote(id: string, player: PlayerId, key: string) {
  const row = getRow(id);
  if (row.status === 'complete') throw new HttpError(409, 'This movie night is already finished');
  db.prepare('DELETE FROM votes WHERE session_id = ? AND player = ? AND key = ?').run(id, player, key);
}

export async function dealMore(id: string, count: number) {
  const row = getRow(id);
  const filters: SessionFilters = { ...DEFAULT_FILTERS, ...JSON.parse(row.filters) };
  const existing = deckKeys(id);
  const more = await buildDeck(filters, Math.max(5, Math.min(30, count)), existing);
  if (!more.length) throw new HttpError(422, 'We ran out of fresh titles for these filters.');
  tx(() => {
    const ins = db.prepare('INSERT OR IGNORE INTO session_titles (session_id, key, position) VALUES (?, ?, ?)');
    more.forEach((t, i) => ins.run(id, t.key, existing.length + i));
    refreshStatus(id);
  });
}

export function chooseTitle(id: string, key: string | null) {
  getRow(id);
  db.prepare('UPDATE sessions SET chosen_key = ? WHERE id = ?').run(key, id);
}

export function deleteSession(id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
