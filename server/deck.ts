import { all, batch, loadConfig, type Config } from './db.ts';
import { fromListItem, getTitle, mapLimit, rememberListItems, tmdb } from './tmdb.ts';
import type { D1Stmt } from './env.ts';
import { GENRES, MOODS, RUNTIMES, periodRange } from '../shared/catalog.ts';
import type { MediaType, SessionFilters, Title } from '../shared/types.ts';
import { parseKey } from '../shared/types.ts';

export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Titles that should not show up in discovery: things we've watched (unless
 * rewatches are on), anything either of us rejected, anything we've both
 * already voted on, and what's already on the watchlist.
 */
export async function excludedKeys(opts: { includeRewatches: boolean; resetAt: string; extra?: Iterable<string> }): Promise<Set<string>> {
  const parts = [
    `SELECT key FROM votes WHERE vote = 'no' AND voted_at > ?1`,
    `SELECT key FROM votes WHERE voted_at > ?1 GROUP BY key HAVING COUNT(DISTINCT player) >= 2`,
    `SELECT key FROM watchlist`,
  ];
  if (!opts.includeRewatches) parts.unshift(`SELECT key FROM watched`);
  const rows = await all<{ key: string }>(parts.join(' UNION '), opts.resetAt);
  const out = new Set<string>(opts.extra ?? []);
  for (const r of rows) out.add(r.key);
  return out;
}

export function discoverParams(type: MediaType, f: SessionFilters, cfg: Pick<Config, 'region' | 'services'>): Record<string, string | number | undefined> {
  const wanted = new Set<string>(f.genres);
  if (!f.genres.length) for (const m of f.moods) for (const g of MOODS.find((x) => x.id === m)?.genres ?? []) wanted.add(g);
  const ids = new Set<number>();
  for (const g of wanted) for (const id of GENRES.find((x) => x.id === g)?.[type] ?? []) ids.add(id);

  const p: Record<string, string | number | undefined> = {
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': f.minRating >= 7 ? 300 : type === 'movie' ? 150 : 60,
    with_genres: ids.size ? [...ids].join('|') : undefined,
    // Skip formats that rarely make a good movie night.
    without_genres: type === 'movie' ? '10770' : wanted.has('documentary') ? '10763,10764,10766,10767' : '10763,10764,10766,10767,99',
  };
  if (f.minRating > 0) p['vote_average.gte'] = f.minRating;

  const range = periodRange(f.period);
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (range.gte) p[`${dateField}.gte`] = range.gte;
  if (range.lte) p[`${dateField}.lte`] = range.lte;
  else if (type === 'movie') p['primary_release_date.lte'] = new Date().toISOString().slice(0, 10);

  if (type === 'movie') {
    const rt = RUNTIMES.find((r) => r.id === f.runtime);
    if (rt?.lte) p['with_runtime.lte'] = rt.lte;
    if (rt?.gte) p['with_runtime.gte'] = rt.gte;
    if (rt?.lte || rt?.gte) p['with_runtime.gte'] ??= 40;
  }

  if (f.onlyMyServices && cfg.services.length) {
    p.watch_region = cfg.region;
    p.with_watch_providers = cfg.services.join('|');
    p.with_watch_monetization_types = 'flatrate|free|ads';
  }
  return p;
}

type Page = { results: unknown[]; total_pages: number };

// Cloudflare's free plan allows 50 outbound requests per call, so a deck
// uses two discover pages per type plus one light lookup per candidate card.
async function candidatesFor(type: MediaType, f: SessionFilters, cfg: Config, exclude: Set<string>, want: number): Promise<Title[]> {
  const params = discoverParams(type, f, cfg);
  const first = await tmdb<Page>(`/discover/${type}`, { ...params, page: 1 }, 30 * 60 * 1000);
  const lists: Page[] = [first];
  const totalPages = Math.min(first.total_pages || 1, 20);
  if (totalPages > 1) {
    const page = 2 + Math.floor(Math.random() * (totalPages - 1));
    lists.push(await tmdb<Page>(`/discover/${type}`, { ...params, page }, 30 * 60 * 1000).catch(() => ({ results: [], total_pages: 0 })));
  }
  const seen = new Set<string>();
  const out: Title[] = [];
  for (const l of lists)
    for (const r of l.results) {
      const t = fromListItem(r, type);
      if (!t || !t.poster || exclude.has(t.key) || seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  return shuffle(out).slice(0, want);
}

/** Pick fresh titles for a movie night and fetch card details for each. */
export async function buildDeck(f: SessionFilters, size: number, extraExclude: Iterable<string> = []): Promise<Title[]> {
  const cfg = await loadConfig();
  const exclude = await excludedKeys({ includeRewatches: f.includeRewatches, resetAt: cfg.resetAt, extra: extraExclude });

  let pool: Title[];
  if (f.source === 'watchlist') {
    const rows = await all<{ key: string }>('SELECT key FROM watchlist');
    const watched = new Set((await all<{ key: string }>('SELECT key FROM watched')).map((r) => r.key));
    const extra = new Set(extraExclude);
    const keys = rows
      .map((r) => r.key)
      .filter((k) => !extra.has(k) && (f.includeRewatches || !watched.has(k)))
      .filter((k) => f.type === 'both' || parseKey(k)?.type === f.type);
    pool = shuffle(keys).map((key) => ({ key }) as Title);
  } else {
    const types: MediaType[] = f.type === 'both' ? ['movie', 'tv'] : [f.type];
    const want = Math.ceil((size * 1.3) / types.length) + 1;
    const lists = await Promise.all(types.map((t) => candidatesFor(t, f, cfg, exclude, want)));
    // Interleave so "both" decks feel mixed.
    pool = [];
    const [a, b = []] = lists;
    while (a.length || b.length) {
      if (a.length) pool.push(a.shift()!);
      if (a.length && Math.random() < 0.5) pool.push(a.shift()!);
      if (b.length) pool.push(b.shift()!);
    }
    await rememberListItems(pool);
  }

  const picked = pool.slice(0, Math.ceil(size * 1.25));
  const writes: D1Stmt[] = [];
  const detailed = await mapLimit(picked, 6, async (t) => {
    try {
      return await getTitle(t.key, cfg.region, writes);
    } catch {
      return null;
    }
  });
  await batch(writes);

  const rt = RUNTIMES.find((r) => r.id === f.runtime);
  return detailed
    .filter((t): t is Title => Boolean(t && t.poster))
    .filter((t) => {
      // TMDB's runtime filter only applies to movies; apply episode length to shows loosely.
      if (t.type !== 'tv' || !t.runtime || f.source === 'watchlist') return true;
      if (rt?.lte && t.runtime > rt.lte) return false;
      return true;
    })
    .slice(0, size);
}
