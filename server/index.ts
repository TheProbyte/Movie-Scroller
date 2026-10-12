import { Hono, type Context } from 'hono';
import { all, batch, ensureSchema, kvAll, kvSet, loadConfig, one, run, stmt } from './db.ts';
import { bindEnv, type Env } from './env.ts';
import {
  TmdbError,
  clearKeyCache,
  fromListItem,
  getDetails,
  getTitle,
  getTitles,
  imageBase,
  listProviders,
  rememberListItems,
  snapshot,
  tmdb,
  tmdbConfigured,
  verifyTmdbKey,
  LIST_TTL,
} from './tmdb.ts';
import { discoverParams, shuffle } from './deck.ts';
import {
  HttpError,
  activeSessions,
  castVote,
  chooseTitle,
  createSession,
  dealMore,
  deleteSession,
  findByCode,
  getSession,
  listSessions,
  undoVote,
} from './sessions.ts';
import { tasteStats } from './stats.ts';
import type {
  AppSettings,
  Bootstrap,
  MediaType,
  Player,
  PlayerId,
  Rails,
  Title,
  Vote,
  WatchedEntry,
  WatchlistEntry,
  WatchlistSection,
} from '../shared/types.ts';
import { DEFAULT_FILTERS, parseKey } from '../shared/types.ts';

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Household passcode (optional)

const enc = new TextEncoder();
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const passcode = (c: Context<{ Bindings: Env }>) => c.env.APP_PASSCODE ?? '';
const expectedToken = (c: Context<{ Bindings: Env }>) => sha256Hex(`moviematch:${passcode(c)}`);
async function isAuthorized(c: Context<{ Bindings: Env }>): Promise<boolean> {
  if (!passcode(c)) return true;
  return safeEqual((c.req.header('x-mm-token') ?? '').trim(), await expectedToken(c));
}

const body = async (c: Context<{ Bindings: Env }>) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const asPlayer = (v: unknown): PlayerId => {
  const n = Number(v);
  if (n !== 1 && n !== 2) throw new HttpError(400, 'Unknown player');
  return n;
};

const toPlayers = (kv: Record<string, unknown>): Player[] =>
  (kv.players as Player[] | undefined) ?? [
    { id: 1, name: 'Player 1' },
    { id: 2, name: 'Player 2' },
  ];
const toSettings = (kv: Record<string, unknown>): AppSettings => ({
  region: (kv.region as string) ?? 'US',
  services: (kv.services as number[]) ?? [],
  setupComplete: (kv.setupComplete as boolean) ?? false,
});

app.use('/api/*', async (c, next) => {
  bindEnv(c.env);
  await ensureSchema();
  await next();
});

app.get('/api/bootstrap', async (c) => {
  const authorized = await isAuthorized(c);
  const kv = authorized ? await kvAll() : {};
  const out: Bootstrap = {
    authRequired: Boolean(passcode(c)),
    authorized,
    tmdbConfigured: await tmdbConfigured(),
    imageBase: imageBase(),
    players: authorized ? toPlayers(kv) : [],
    settings: authorized ? toSettings(kv) : { region: 'US', services: [], setupComplete: false },
  };
  return c.json(out);
});

app.post('/api/auth', async (c) => {
  const b = await body(c);
  if (!passcode(c) || String(b.passcode ?? '') !== passcode(c)) throw new HttpError(401, 'That passcode didn’t work');
  return c.json({ token: await expectedToken(c) });
});

app.use('/api/*', async (c, next) => {
  if (await isAuthorized(c)) return next();
  return c.json({ error: 'Passcode required' }, 401);
});

// ---------------------------------------------------------------------------
// Settings

app.put('/api/settings', async (c) => {
  const b = await body(c);
  if (typeof b.tmdbKey === 'string' && b.tmdbKey.trim()) {
    const key = b.tmdbKey.trim();
    if (!(await verifyTmdbKey(key))) throw new HttpError(400, 'TMDB didn’t accept that key. Double-check it and try again.');
    await kvSet('tmdbKey', key);
    clearKeyCache();
  }
  if (Array.isArray(b.players)) {
    const names = b.players.map((p: { name?: string }) => String(p?.name ?? '').trim().slice(0, 24));
    await kvSet('players', [
      { id: 1, name: names[0] || 'Player 1' },
      { id: 2, name: names[1] || 'Player 2' },
    ]);
  }
  if (typeof b.region === 'string' && /^[A-Z]{2}$/.test(b.region)) await kvSet('region', b.region);
  if (Array.isArray(b.services)) await kvSet('services', b.services.map(Number).filter(Number.isFinite).slice(0, 40));
  if (typeof b.setupComplete === 'boolean') await kvSet('setupComplete', b.setupComplete);
  const kv = await kvAll();
  return c.json({ players: toPlayers(kv), settings: toSettings(kv), tmdbConfigured: await tmdbConfigured() });
});

app.get('/api/providers', async (c) => c.json(await listProviders(c.req.query('region') ?? (await loadConfig()).region)));

app.post('/api/reset-discovery', async (c) => {
  await kvSet('discoveryResetAt', new Date().toISOString());
  return c.json({ ok: true });
});

/** Wipe test data. "nights" clears movie nights, votes and taste; "all" also clears watchlist and watched. */
app.post('/api/reset-all', async (c) => {
  const b = await body(c);
  if (b.confirm !== true) throw new HttpError(400, 'Confirmation required');
  const stmts = [stmt('DELETE FROM votes'), stmt('DELETE FROM session_titles'), stmt('DELETE FROM sessions')];
  if (b.scope === 'all') stmts.push(stmt('DELETE FROM watchlist'), stmt('DELETE FROM watched'));
  stmts.push(stmt('DELETE FROM kv WHERE key = ?', 'discoveryResetAt'));
  await batch(stmts);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Watchlist & watched rows

interface WatchlistRow { key: string; section: WatchlistSection; added_at: string; added_by: PlayerId | null; session_id: string | null }
interface WatchedRow { key: string; watched_at: string; rating1: number | null; rating2: number | null; session_id: string | null }

const toWatchlist = (r: WatchlistRow): WatchlistEntry => ({ key: r.key, section: r.section, addedAt: r.added_at, addedBy: r.added_by, sessionId: r.session_id });
const toWatched = (r: WatchedRow): WatchedEntry => {
  const ratings: WatchedEntry['ratings'] = {};
  if (r.rating1 != null) ratings[1] = r.rating1;
  if (r.rating2 != null) ratings[2] = r.rating2;
  return { key: r.key, watchedAt: r.watched_at, ratings, sessionId: r.session_id };
};

const SECTION_RANK: Record<WatchlistSection, number> = { both: 3, maybe: 2, saved: 1 };

async function ensureTitle(key: string) {
  if (!parseKey(key)) throw new HttpError(400, 'Bad title key');
  await getTitle(key, (await loadConfig()).region);
}

// ---------------------------------------------------------------------------
// Titles, search and browsing

app.get('/api/titles/:key', async (c) => {
  const key = c.req.param('key');
  const cfg = await loadConfig();
  const [details, wl, w, history] = await Promise.all([
    getDetails(key, cfg.region),
    one<WatchlistRow>('SELECT * FROM watchlist WHERE key = ?', key),
    one<WatchedRow>('SELECT * FROM watched WHERE key = ?', key),
    all<{ id: string; created_at: string; player: PlayerId; vote: Vote }>(
      `SELECT s.id, s.created_at, v.player, v.vote FROM votes v JOIN sessions s ON s.id = v.session_id
       WHERE v.key = ? AND s.status = 'complete' ORDER BY s.created_at DESC`,
      key,
    ),
  ]);
  const bySession = new Map<string, { sessionId: string; date: string; votes: Partial<Record<PlayerId, Vote>> }>();
  for (const r of history) {
    const e = bySession.get(r.id) ?? { sessionId: r.id, date: r.created_at, votes: {} };
    e.votes[r.player] = r.vote;
    bySession.set(r.id, e);
  }
  return c.json({ details, state: { watchlist: wl ? toWatchlist(wl) : null, watched: w ? toWatched(w) : null }, history: [...bySession.values()] });
});

app.post('/api/titles/batch', async (c) => {
  const b = await body(c);
  return c.json(await getTitles(((b.keys ?? []) as unknown[]).map(String).slice(0, 200), (await loadConfig()).region));
});

app.post('/api/titles/:key/refresh', async (c) => {
  const cfg = await loadConfig();
  await run('UPDATE titles SET updated_at = 0 WHERE key = ?', c.req.param('key'));
  return c.json(snapshot(await getDetails(c.req.param('key'), cfg.region)));
});

const keepMedia = (list: (Title | null)[]) => list.filter((t): t is Title => Boolean(t && t.poster));

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json([]);
  const data = await tmdb<{ results: unknown[] }>('/search/multi', { query: q, include_adult: 'false' }, 10 * 60 * 1000);
  const items = keepMedia(data.results.map((r) => fromListItem(r)));
  await rememberListItems(items);
  return c.json(items);
});

async function listOf(path: string, params: Record<string, string | number | undefined>, type?: MediaType): Promise<Title[]> {
  try {
    const data = await tmdb<{ results: unknown[] }>(path, params, LIST_TTL);
    return keepMedia(data.results.map((r) => fromListItem(r, type)));
  } catch (e) {
    if (e instanceof TmdbError && e.status === 503) throw e;
    return [];
  }
}

async function forYou(): Promise<Title[]> {
  const seeds = (
    await all<{ key: string }>(
      `SELECT key FROM (
         SELECT key, 3 AS w FROM watched WHERE COALESCE(rating1, 0) + COALESCE(rating2, 0) >= 7
         UNION ALL SELECT key, 2 FROM watchlist WHERE section = 'both'
         UNION ALL SELECT v.key, 1 FROM votes v GROUP BY v.session_id, v.key HAVING SUM(v.vote = 'yes') >= 2
       ) GROUP BY key ORDER BY MAX(w) DESC, RANDOM() LIMIT 12`,
    )
  ).map((r) => r.key);
  const picks = shuffle(seeds).slice(0, 3);
  const lists = await Promise.all(
    picks.map((k) => {
      const p = parseKey(k)!;
      return listOf(`/${p.type}/${p.id}/recommendations`, {}, p.type);
    }),
  );
  const merged: Title[] = [];
  const seen = new Set<string>(seeds);
  for (let i = 0; merged.length < 30 && lists.some((l) => l[i]); i++)
    for (const l of lists) if (l[i] && !seen.has(l[i].key)) (seen.add(l[i].key), merged.push(l[i]));
  return merged;
}

app.get('/api/rails', async (c) => {
  const today = new Date();
  const monthsAgo = (n: number) => new Date(today.getFullYear(), today.getMonth() - n, today.getDate()).toISOString().slice(0, 10);
  const cfg = await loadConfig();
  const [trending, newReleases, popularTv, classics, onOurServices, recs] = await Promise.all([
    listOf('/trending/all/week', {}),
    listOf('/discover/movie', {
      sort_by: 'popularity.desc', 'vote_count.gte': 40, 'primary_release_date.gte': monthsAgo(6), 'primary_release_date.lte': today.toISOString().slice(0, 10),
      watch_region: cfg.region, with_watch_monetization_types: 'flatrate|rent|buy',
    }, 'movie'),
    listOf('/discover/tv', { sort_by: 'popularity.desc', 'vote_count.gte': 150, without_genres: '10763,10764,10766,10767' }, 'tv'),
    listOf('/discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 4000, 'primary_release_date.lte': '1999-12-31', page: 1 + (today.getDate() % 3) }, 'movie'),
    cfg.services.length
      ? listOf('/discover/movie', { ...discoverParams('movie', { ...DEFAULT_FILTERS, onlyMyServices: true }, cfg), page: 1 + (today.getDate() % 2) }, 'movie')
      : Promise.resolve([]),
    forYou(),
  ]);
  const ex = new Set((await all<{ key: string }>(`SELECT key FROM watched UNION SELECT key FROM votes WHERE vote = 'no' AND voted_at > ?`, cfg.resetAt)).map((r) => r.key));
  const clean = (l: Title[]) => l.filter((t) => !ex.has(t.key));
  const out: Rails = {
    forYou: clean(recs),
    trending: clean(trending),
    newReleases: clean(newReleases),
    popularTv: clean(popularTv),
    classics: clean(classics),
    onOurServices: clean(onOurServices),
  };
  await rememberListItems(Object.values(out).flat());
  return c.json(out);
});

// ---------------------------------------------------------------------------
// Watchlist & watched

app.get('/api/watchlist', async (c) => {
  const entries = (await all<WatchlistRow>('SELECT * FROM watchlist ORDER BY added_at DESC')).map(toWatchlist);
  return c.json({ entries, titles: await getTitles(entries.map((e) => e.key), (await loadConfig()).region) });
});

app.post('/api/watchlist', async (c) => {
  const b = await body(c);
  const items: { key: string; section?: WatchlistSection }[] = Array.isArray(b.items) ? b.items : [b as { key: string }];
  const by = b.addedBy ? asPlayer(b.addedBy) : null;
  const sessionId = typeof b.sessionId === 'string' ? b.sessionId : null;
  const existing = new Map((await all<{ key: string; section: WatchlistSection }>('SELECT key, section FROM watchlist')).map((r) => [r.key, r.section]));
  const writes = [];
  for (const it of items) {
    const key = String(it.key);
    const section: WatchlistSection = it.section === 'both' || it.section === 'maybe' ? it.section : 'saved';
    const had = existing.get(key);
    // Never downgrade "both want to watch" to a weaker section.
    if (had && SECTION_RANK[had] >= SECTION_RANK[section] && !b.force) continue;
    await ensureTitle(key);
    writes.push(
      stmt(
        `INSERT INTO watchlist (key, section, added_at, added_by, session_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET section = excluded.section`,
        key, section, new Date().toISOString(), by, sessionId,
      ),
    );
  }
  await batch(writes);
  return c.json({ ok: true });
});

app.delete('/api/watchlist/:key', async (c) => {
  await run('DELETE FROM watchlist WHERE key = ?', c.req.param('key'));
  return c.json({ ok: true });
});

app.get('/api/watched', async (c) => {
  const entries = (await all<WatchedRow>('SELECT * FROM watched ORDER BY watched_at DESC')).map(toWatched);
  return c.json({ entries, titles: await getTitles(entries.map((e) => e.key), (await loadConfig()).region) });
});

app.post('/api/watched', async (c) => {
  const b = await body(c);
  const key = String(b.key ?? '');
  await ensureTitle(key);
  const when = typeof b.watchedAt === 'string' ? new Date(b.watchedAt).toISOString() : new Date().toISOString();
  await batch([
    stmt(
      `INSERT INTO watched (key, watched_at, session_id) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET watched_at = excluded.watched_at, session_id = COALESCE(excluded.session_id, watched.session_id)`,
      key, when, typeof b.sessionId === 'string' ? b.sessionId : null,
    ),
    // Watched titles leave the watchlist automatically.
    stmt('DELETE FROM watchlist WHERE key = ?', key),
  ]);
  return c.json({ ok: true });
});

app.put('/api/watched/:key/rating', async (c) => {
  const b = await body(c);
  const player = asPlayer(b.player);
  const rating = b.rating == null ? null : Math.max(0.5, Math.min(5, Math.round(Number(b.rating) * 2) / 2));
  const changes = await run(`UPDATE watched SET rating${player} = ? WHERE key = ?`, rating, c.req.param('key'));
  if (!changes) throw new HttpError(404, 'Mark it as watched first');
  return c.json({ ok: true });
});

app.delete('/api/watched/:key', async (c) => {
  await run('DELETE FROM watched WHERE key = ?', c.req.param('key'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Movie nights

app.get('/api/sessions', async (c) => c.json(await listSessions()));
app.get('/api/sessions/active', async (c) => c.json(await activeSessions()));
app.get('/api/sessions/code/:code', async (c) => c.json({ id: await findByCode(c.req.param('code')) }));

app.post('/api/sessions', async (c) => {
  const b = await body(c);
  const createdBy = asPlayer(b.createdBy ?? 1);
  const id = await createSession({
    mode: b.mode === 'duo' ? 'duo' : 'pass',
    filters: b.filters ?? {},
    createdBy,
    firstPlayer: b.firstPlayer ? asPlayer(b.firstPlayer) : createdBy,
  });
  return c.json({ id });
});

app.get('/api/sessions/:id', async (c) => c.json(await getSession(c.req.param('id'))));

app.post('/api/sessions/:id/votes', async (c) => {
  const b = await body(c);
  if (!['yes', 'no', 'maybe'].includes(b.vote)) throw new HttpError(400, 'Bad vote');
  await castVote(c.req.param('id'), asPlayer(b.player), String(b.key), b.vote as Vote);
  return c.json({ ok: true });
});

app.delete('/api/sessions/:id/votes', async (c) => {
  const b = await body(c);
  await undoVote(c.req.param('id'), asPlayer(b.player), String(b.key));
  return c.json({ ok: true });
});

app.post('/api/sessions/:id/more', async (c) => {
  const b = await body(c);
  await dealMore(c.req.param('id'), Number(b.count ?? 10));
  return c.json({ ok: true });
});

app.post('/api/sessions/:id/choose', async (c) => {
  const b = await body(c);
  await chooseTitle(c.req.param('id'), b.key ? String(b.key) : null);
  return c.json({ ok: true });
});

app.delete('/api/sessions/:id', async (c) => {
  await deleteSession(c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/stats', async (c) => c.json(await tasteStats()));

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError || err instanceof TmdbError) {
    const rejected = err instanceof TmdbError && err.status === 401;
    const status = (rejected ? 502 : err.status) as 400 | 401 | 404 | 409 | 422 | 502 | 503;
    return c.json({ error: rejected ? 'TMDB rejected our API key' : err.message }, status);
  }
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;
