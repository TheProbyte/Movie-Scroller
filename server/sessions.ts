import { all, batch, chunk, loadConfig, one, placeholders, run, stmt } from './db.ts';
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

async function newCode(): Promise<string> {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    const clash = await one("SELECT 1 AS x FROM sessions WHERE code = ? AND status = 'swiping'", code);
    if (!clash) return code;
  }
}

type VoteMap = Record<string, Partial<Record<PlayerId, Vote>>>;

function computeResults(keys: string[], votes: VoteMap, titles: Record<string, Title>): SessionResults {
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
  const scoped: VoteMap = {};
  for (const k of keys) scoped[k] = votes[k] ?? {};
  return { votes: scoped, perfect, possible: possible.map((p) => p.key) };
}

function progressOf(keys: string[], votes: VoteMap): Record<PlayerId, Progress> {
  const count = (p: PlayerId) => keys.filter((k) => votes[k]?.[p]).length;
  return { 1: { done: count(1), total: keys.length }, 2: { done: count(2), total: keys.length } };
}

/** Loads deck keys and votes for many sessions in a couple of queries. */
async function loadData(rows: SessionRow[]) {
  const keys = new Map<string, string[]>();
  const votes = new Map<string, VoteMap>();
  for (const r of rows) {
    keys.set(r.id, []);
    votes.set(r.id, {});
  }
  for (const part of chunk(
    rows.map((r) => r.id),
    80,
  )) {
    const ph = placeholders(part.length);
    for (const r of await all<{ session_id: string; key: string }>(`SELECT session_id, key FROM session_titles WHERE session_id IN (${ph}) ORDER BY position`, ...part))
      keys.get(r.session_id)!.push(r.key);
    for (const r of await all<{ session_id: string; player: PlayerId; key: string; vote: Vote }>(`SELECT session_id, player, key, vote FROM votes WHERE session_id IN (${ph})`, ...part)) {
      const m = votes.get(r.session_id)!;
      (m[r.key] ??= {})[r.player] = r.vote;
    }
  }
  return { keys, votes };
}

function summarize(row: SessionRow, keys: string[], votes: VoteMap, titles: Record<string, Title>): SessionSummary {
  const complete = row.status === 'complete';
  const results = complete ? computeResults(keys, votes, titles) : null;
  const previewKeys = [...new Set([...(results?.perfect ?? []), ...(results?.possible ?? []), ...keys])].slice(0, 4);
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
    posterPreview: previewKeys.map((k) => titles[k]?.poster ?? null),
  };
}

/** Summaries for a list of nights, fetching only the few posters each card needs. */
async function summaries(rows: SessionRow[]): Promise<SessionSummary[]> {
  if (!rows.length) return [];
  const { keys, votes } = await loadData(rows);
  const region = (await loadConfig()).region;
  const needed = new Set<string>();
  for (const r of rows) {
    const k = keys.get(r.id)!;
    const s = summarize(r, k, votes.get(r.id)!, {});
    for (const key of [...new Set([...s.perfectKeys, ...s.possibleKeys, ...k])].slice(0, 4)) needed.add(key);
  }
  const titles = await getTitles([...needed], region);
  return rows.map((r) => summarize(r, keys.get(r.id)!, votes.get(r.id)!, titles));
}

async function getRow(id: string): Promise<SessionRow> {
  const row = await one<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'Movie night not found');
  return row;
}

export async function listSessions(): Promise<SessionSummary[]> {
  return summaries(await all<SessionRow>('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100'));
}

export async function activeSessions(): Promise<SessionSummary[]> {
  // Nights older than two days are treated as abandoned (they stay in history).
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  return summaries(await all<SessionRow>("SELECT * FROM sessions WHERE status = 'swiping' AND created_at > ? ORDER BY created_at DESC LIMIT 5", since));
}

export async function getSession(id: string): Promise<SessionDetail> {
  const row = await getRow(id);
  const { keys, votes } = await loadData([row]);
  const k = keys.get(id)!;
  const v = votes.get(id)!;
  const titles = await getTitles(k, (await loadConfig()).region);
  return {
    ...summarize(row, k, v, titles),
    deck: k.map((key) => titles[key]).filter(Boolean),
    votedKeys: { 1: k.filter((key) => v[key]?.[1]), 2: k.filter((key) => v[key]?.[2]) },
    // Votes stay secret until both players are done.
    results: row.status === 'complete' ? computeResults(k, v, titles) : null,
  };
}

export async function findByCode(code: string): Promise<string> {
  const row = await one<{ id: string }>(
    "SELECT id FROM sessions WHERE code = ? ORDER BY CASE status WHEN 'swiping' THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
    code.trim().toUpperCase(),
  );
  if (!row) throw new HttpError(404, 'No movie night with that code');
  return row.id;
}

export async function createSession(input: { mode: SessionMode; filters: Partial<SessionFilters>; createdBy: PlayerId; firstPlayer: PlayerId }): Promise<string> {
  const filters: SessionFilters = { ...DEFAULT_FILTERS, ...input.filters };
  filters.size = Math.max(5, Math.min(30, Math.round(filters.size || 20)));
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
  await batch([
    stmt('INSERT INTO sessions (id, code, mode, status, filters, created_at, created_by, first_player) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, await newCode(), input.mode, 'swiping', JSON.stringify(filters), new Date().toISOString(), input.createdBy, input.firstPlayer),
    ...deck.map((t, i) => stmt('INSERT INTO session_titles (session_id, key, position) VALUES (?, ?, ?)', id, t.key, i)),
  ]);
  return id;
}

async function refreshStatus(id: string) {
  const total = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM session_titles WHERE session_id = ?', id))?.n ?? 0;
  const counts = await all<{ player: number; n: number }>('SELECT player, COUNT(*) AS n FROM votes WHERE session_id = ? GROUP BY player', id);
  const done = (p: number) => counts.find((c) => c.player === p)?.n ?? 0;
  const complete = total > 0 && done(1) >= total && done(2) >= total;
  const row = await getRow(id);
  if (complete && row.status !== 'complete') await run("UPDATE sessions SET status = 'complete', completed_at = ? WHERE id = ?", new Date().toISOString(), id);
  else if (!complete && row.status === 'complete') await run("UPDATE sessions SET status = 'swiping', completed_at = NULL WHERE id = ?", id);
}

export async function castVote(id: string, player: PlayerId, key: string, vote: Vote) {
  const row = await getRow(id);
  if (row.status === 'complete') throw new HttpError(409, 'This movie night is already finished');
  if (!(await one('SELECT 1 AS x FROM session_titles WHERE session_id = ? AND key = ?', id, key))) throw new HttpError(400, 'Title is not in this movie night');
  await run(
    `INSERT INTO votes (session_id, player, key, vote, voted_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, player, key) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`,
    id, player, key, vote, new Date().toISOString(),
  );
  await refreshStatus(id);
}

export async function undoVote(id: string, player: PlayerId, key: string) {
  const row = await getRow(id);
  if (row.status === 'complete') throw new HttpError(409, 'This movie night is already finished');
  await run('DELETE FROM votes WHERE session_id = ? AND player = ? AND key = ?', id, player, key);
}

export async function dealMore(id: string, count: number) {
  const row = await getRow(id);
  const filters: SessionFilters = { ...DEFAULT_FILTERS, ...JSON.parse(row.filters) };
  const existing = (await all<{ key: string }>('SELECT key FROM session_titles WHERE session_id = ? ORDER BY position', id)).map((r) => r.key);
  const more = await buildDeck(filters, Math.max(5, Math.min(20, count)), existing);
  if (!more.length) throw new HttpError(422, 'We ran out of fresh titles for these filters.');
  await batch(more.map((t, i) => stmt('INSERT OR IGNORE INTO session_titles (session_id, key, position) VALUES (?, ?, ?)', id, t.key, existing.length + i)));
  await refreshStatus(id);
}

export async function chooseTitle(id: string, key: string | null) {
  await getRow(id);
  await run('UPDATE sessions SET chosen_key = ? WHERE id = ?', key, id);
}

export async function deleteSession(id: string) {
  await run('DELETE FROM sessions WHERE id = ?', id);
}
