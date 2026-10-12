import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, kvGet, kvSet } from './db.ts';
import {
  IMAGE_BASE,
  LIST_TTL,
  TmdbError,
  fromListItem,
  getDetails,
  getTitles,
  listProviders,
  rememberListItems,
  snapshot,
  tmdb,
  tmdbConfigured,
  verifyTmdbKey,
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
import { broadcast, subscribe } from './events.ts';
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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

// ---------------------------------------------------------------------------
// Household passcode (optional)

const PASSCODE = process.env.APP_PASSCODE ?? '';
const expectedToken = PASSCODE ? crypto.createHash('sha256').update(`moviematch:${PASSCODE}`).digest('hex') : '';
const tokenOf = (req: Request) => (req.header('x-mm-token') ?? (req.query.token as string | undefined) ?? '').trim();
const isAuthorized = (req: Request) => {
  if (!PASSCODE) return true;
  const t = tokenOf(req);
  return t.length === expectedToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expectedToken));
};

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res))
    .then((out) => {
      if (!res.headersSent) res.json(out ?? { ok: true });
    })
    .catch(next);
};

const players = (): Player[] => kvGet<Player[]>('players', [
  { id: 1, name: 'Player 1' },
  { id: 2, name: 'Player 2' },
]);
const settings = (): AppSettings => ({
  region: kvGet('region', 'US'),
  services: kvGet<number[]>('services', []),
  setupComplete: kvGet('setupComplete', false),
});

const api = express.Router();

api.get('/bootstrap', h((req): Bootstrap => ({
  authRequired: Boolean(PASSCODE),
  authorized: isAuthorized(req),
  tmdbConfigured: tmdbConfigured(),
  imageBase: IMAGE_BASE,
  players: isAuthorized(req) ? players() : [],
  settings: isAuthorized(req) ? settings() : { region: 'US', services: [], setupComplete: false },
})));

api.post('/auth', h((req) => {
  const ok = PASSCODE && String(req.body?.passcode ?? '') === PASSCODE;
  if (!ok) throw new HttpError(401, 'That passcode didn’t work');
  return { token: expectedToken };
}));

api.use((req, res, next) => {
  if (isAuthorized(req)) return next();
  res.status(401).json({ error: 'Passcode required' });
});

api.get('/events', (req, res) => subscribe(req, res));

// ---------------------------------------------------------------------------
// Settings

const asPlayer = (v: unknown): PlayerId => {
  const n = Number(v);
  if (n !== 1 && n !== 2) throw new HttpError(400, 'Unknown player');
  return n;
};

api.put('/settings', h(async (req) => {
  const b = req.body ?? {};
  if (typeof b.tmdbKey === 'string' && b.tmdbKey.trim()) {
    const key = b.tmdbKey.trim();
    if (!(await verifyTmdbKey(key))) throw new HttpError(400, 'TMDB didn’t accept that key. Double-check it and try again.');
    kvSet('tmdbKey', key);
  }
  if (Array.isArray(b.players)) {
    const names = b.players.map((p: { name?: string }) => String(p?.name ?? '').trim().slice(0, 24));
    kvSet('players', [
      { id: 1, name: names[0] || 'Player 1' },
      { id: 2, name: names[1] || 'Player 2' },
    ]);
  }
  if (typeof b.region === 'string' && /^[A-Z]{2}$/.test(b.region)) kvSet('region', b.region);
  if (Array.isArray(b.services)) kvSet('services', b.services.map(Number).filter(Number.isFinite).slice(0, 40));
  if (typeof b.setupComplete === 'boolean') kvSet('setupComplete', b.setupComplete);
  broadcast('settings');
  return { players: players(), settings: settings(), tmdbConfigured: tmdbConfigured() };
}));

api.get('/providers', h(async (req) => listProviders(String(req.query.region ?? settings().region))));

api.post('/reset-discovery', h(() => {
  kvSet('discoveryResetAt', new Date().toISOString());
  return { ok: true };
}));

// ---------------------------------------------------------------------------
// Titles, search and browsing

function personalState(key: string) {
  const wl = db.prepare('SELECT * FROM watchlist WHERE key = ?').get(key) as WatchlistRow | undefined;
  const w = db.prepare('SELECT * FROM watched WHERE key = ?').get(key) as WatchedRow | undefined;
  return { watchlist: wl ? toWatchlist(wl) : null, watched: w ? toWatched(w) : null };
}

api.get('/titles/:key', h(async (req) => {
  const key = String(req.params.key);
  const details = await getDetails(key);
  const history = db
    .prepare(
      `SELECT s.id, s.created_at, v.player, v.vote FROM votes v JOIN sessions s ON s.id = v.session_id
       WHERE v.key = ? AND s.status = 'complete' ORDER BY s.created_at DESC`,
    )
    .all(key) as { id: string; created_at: string; player: PlayerId; vote: Vote }[];
  const bySession = new Map<string, { sessionId: string; date: string; votes: Partial<Record<PlayerId, Vote>> }>();
  for (const r of history) {
    const e = bySession.get(r.id) ?? { sessionId: r.id, date: r.created_at, votes: {} };
    e.votes[r.player] = r.vote;
    bySession.set(r.id, e);
  }
  return { details, state: personalState(key), history: [...bySession.values()] };
}));

const keepMedia = (list: (Title | null)[]) => list.filter((t): t is Title => Boolean(t && t.poster));

api.get('/search', h(async (req) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return [];
  const data = await tmdb<{ results: unknown[] }>('/search/multi', { query: q, include_adult: 'false' }, 10 * 60 * 1000);
  const items = keepMedia(data.results.map((r) => fromListItem(r)));
  rememberListItems(items);
  return items;
}));

function browseExclusions(): Set<string> {
  const out = new Set<string>();
  for (const r of db.prepare('SELECT key FROM watched').all() as { key: string }[]) out.add(r.key);
  const resetAt = kvGet('discoveryResetAt', '1970-01-01');
  for (const r of db.prepare("SELECT DISTINCT key FROM votes WHERE vote = 'no' AND voted_at > ?").all(resetAt) as { key: string }[]) out.add(r.key);
  return out;
}

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
    db
      .prepare(
        `SELECT key FROM (
           SELECT key, 3 AS w FROM watched WHERE COALESCE(rating1, 0) + COALESCE(rating2, 0) >= 7
           UNION ALL SELECT key, 2 FROM watchlist WHERE section = 'both'
           UNION ALL SELECT v.key, 1 FROM votes v GROUP BY v.session_id, v.key HAVING SUM(v.vote = 'yes') >= 2
         ) GROUP BY key ORDER BY MAX(w) DESC, RANDOM() LIMIT 12`,
      )
      .all() as { key: string }[]
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

api.get('/rails', h(async (): Promise<Rails> => {
  const today = new Date();
  const monthsAgo = (n: number) => new Date(today.getFullYear(), today.getMonth() - n, today.getDate()).toISOString().slice(0, 10);
  const s = settings();
  const [trending, newReleases, popularTv, classics, onOurServices, recs] = await Promise.all([
    listOf('/trending/all/week', {}),
    listOf('/discover/movie', {
      sort_by: 'popularity.desc', 'vote_count.gte': 40, 'primary_release_date.gte': monthsAgo(6), 'primary_release_date.lte': today.toISOString().slice(0, 10),
      watch_region: s.region, with_watch_monetization_types: 'flatrate|rent|buy',
    }, 'movie'),
    listOf('/discover/tv', { sort_by: 'popularity.desc', 'vote_count.gte': 150, without_genres: '10763,10764,10766,10767' }, 'tv'),
    listOf('/discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 4000, 'primary_release_date.lte': '1999-12-31', page: 1 + (today.getDate() % 3) }, 'movie'),
    s.services.length
      ? listOf('/discover/movie', { ...discoverParams('movie', { ...DEFAULT_FILTERS, onlyMyServices: true }), page: 1 + (today.getDate() % 2) }, 'movie')
      : Promise.resolve([]),
    forYou(),
  ]);
  const ex = browseExclusions();
  const clean = (l: Title[]) => {
    const out = l.filter((t) => !ex.has(t.key));
    rememberListItems(out);
    return out;
  };
  return {
    forYou: clean(recs),
    trending: clean(trending),
    newReleases: clean(newReleases),
    popularTv: clean(popularTv),
    classics: clean(classics),
    onOurServices: clean(onOurServices),
  };
}));

// ---------------------------------------------------------------------------
// Watchlist & watched

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
  await getDetails(key);
}

api.get('/watchlist', h(async () => {
  const rows = db.prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all() as unknown as WatchlistRow[];
  const entries = rows.map(toWatchlist);
  return { entries, titles: await getTitles(entries.map((e) => e.key)) };
}));

api.post('/watchlist', h(async (req) => {
  const items: { key: string; section?: WatchlistSection }[] = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  const by = req.body?.addedBy ? asPlayer(req.body.addedBy) : null;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : null;
  for (const it of items) {
    const section: WatchlistSection = it.section === 'both' || it.section === 'maybe' ? it.section : 'saved';
    await ensureTitle(String(it.key));
    const existing = db.prepare('SELECT section FROM watchlist WHERE key = ?').get(it.key) as { section: WatchlistSection } | undefined;
    // Never downgrade "both want to watch" to a weaker section.
    if (existing && SECTION_RANK[existing.section] >= SECTION_RANK[section] && !req.body?.force) continue;
    db.prepare(
      `INSERT INTO watchlist (key, section, added_at, added_by, session_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET section = excluded.section`,
    ).run(it.key, section, new Date().toISOString(), by, sessionId);
  }
  broadcast('watchlist');
  return { ok: true };
}));

api.delete('/watchlist/:key', h((req) => {
  db.prepare('DELETE FROM watchlist WHERE key = ?').run(String(req.params.key));
  broadcast('watchlist');
}));

api.get('/watched', h(async () => {
  const rows = db.prepare('SELECT * FROM watched ORDER BY watched_at DESC').all() as unknown as WatchedRow[];
  const entries = rows.map(toWatched);
  return { entries, titles: await getTitles(entries.map((e) => e.key)) };
}));

api.post('/watched', h(async (req) => {
  const key = String(req.body?.key ?? '');
  await ensureTitle(key);
  const when = typeof req.body?.watchedAt === 'string' ? new Date(req.body.watchedAt).toISOString() : new Date().toISOString();
  db.prepare(
    `INSERT INTO watched (key, watched_at, session_id) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET watched_at = excluded.watched_at, session_id = COALESCE(excluded.session_id, watched.session_id)`,
  ).run(key, when, typeof req.body?.sessionId === 'string' ? req.body.sessionId : null);
  // Watched titles leave the watchlist automatically.
  db.prepare('DELETE FROM watchlist WHERE key = ?').run(key);
  broadcast('watched');
  broadcast('watchlist');
}));

api.put('/watched/:key/rating', h((req) => {
  const player = asPlayer(req.body?.player);
  const raw = req.body?.rating;
  const rating = raw == null ? null : Math.max(0.5, Math.min(5, Math.round(Number(raw) * 2) / 2));
  const res = db.prepare(`UPDATE watched SET rating${player} = ? WHERE key = ?`).run(rating, String(req.params.key));
  if (!res.changes) throw new HttpError(404, 'Mark it as watched first');
  broadcast('watched');
}));

api.delete('/watched/:key', h((req) => {
  db.prepare('DELETE FROM watched WHERE key = ?').run(String(req.params.key));
  broadcast('watched');
}));

// ---------------------------------------------------------------------------
// Movie nights

api.get('/sessions', h(() => listSessions()));
api.get('/sessions/active', h(() => activeSessions()));
api.get('/sessions/code/:code', h((req) => ({ id: findByCode(String(req.params.code)) })));

api.post('/sessions', h(async (req) => {
  const b = req.body ?? {};
  const createdBy = asPlayer(b.createdBy ?? 1);
  const id = await createSession({
    mode: b.mode === 'duo' ? 'duo' : 'pass',
    filters: b.filters ?? {},
    createdBy,
    firstPlayer: b.firstPlayer ? asPlayer(b.firstPlayer) : createdBy,
  });
  broadcast('session', { id });
  return { id };
}));

api.get('/sessions/:id', h((req) => getSession(String(req.params.id))));

api.post('/sessions/:id/votes', h((req) => {
  const vote = req.body?.vote as Vote;
  if (!['yes', 'no', 'maybe'].includes(vote)) throw new HttpError(400, 'Bad vote');
  castVote(String(req.params.id), asPlayer(req.body?.player), String(req.body?.key), vote);
  broadcast('session', { id: req.params.id });
}));

api.delete('/sessions/:id/votes', h((req) => {
  undoVote(String(req.params.id), asPlayer(req.body?.player), String(req.body?.key));
  broadcast('session', { id: req.params.id });
}));

api.post('/sessions/:id/more', h(async (req) => {
  await dealMore(String(req.params.id), Number(req.body?.count ?? 10));
  broadcast('session', { id: req.params.id });
}));

api.post('/sessions/:id/choose', h((req) => {
  const key = req.body?.key ? String(req.body.key) : null;
  chooseTitle(String(req.params.id), key);
  broadcast('session', { id: req.params.id });
}));

api.delete('/sessions/:id', h((req) => {
  deleteSession(String(req.params.id));
  broadcast('session', { id: req.params.id });
}));

api.get('/stats', h(() => tasteStats()));

// Small helper so the client can render stored snapshots in bulk.
api.post('/titles/batch', h(async (req) => getTitles((req.body?.keys ?? []).map(String).slice(0, 200))));

api.post('/titles/:key/refresh', h(async (req) => snapshot(await getDetails(String(req.params.key), { force: true }))));

api.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use('/api', api);

// ---------------------------------------------------------------------------
// Static client (production)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(root)) {
  app.use(
    express.static(root, {
      index: false,
      setHeaders(res, file) {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(root, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError || err instanceof TmdbError) {
    const status = err instanceof TmdbError && err.status === 401 ? 502 : err.status;
    const message = err instanceof TmdbError && err.status === 401 ? 'TMDB rejected our API key' : err.message;
    res.status(status).json({ error: message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`🍿 MovieMatch is running on http://localhost:${port}`);
  if (!tmdbConfigured()) console.log('   TMDB key not set yet — add it in the app or via TMDB_API_KEY.');
});
