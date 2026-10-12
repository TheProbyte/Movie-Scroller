import { db, kvGet } from './db.ts';
import { fromListItem, getDetails, mapLimit, rememberListItems, snapshot, tmdb } from './tmdb.ts';
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
export function excludedKeys(opts: { includeRewatches: boolean; extra?: Iterable<string> }): Set<string> {
  const resetAt = kvGet<string>('discoveryResetAt', '1970-01-01');
  const out = new Set<string>(opts.extra ?? []);
  if (!opts.includeRewatches) for (const r of db.prepare('SELECT key FROM watched').all() as { key: string }[]) out.add(r.key);
  for (const r of db.prepare("SELECT DISTINCT key FROM votes WHERE vote = 'no' AND voted_at > ?").all(resetAt) as { key: string }[]) out.add(r.key);
  for (const r of db
    .prepare('SELECT key FROM votes WHERE voted_at > ? GROUP BY key HAVING COUNT(DISTINCT player) >= 2')
    .all(resetAt) as { key: string }[])
    out.add(r.key);
  for (const r of db.prepare('SELECT key FROM watchlist').all() as { key: string }[]) out.add(r.key);
  return out;
}

export function discoverParams(type: MediaType, f: SessionFilters): Record<string, string | number | undefined> {
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

  const services = kvGet<number[]>('services', []);
  if (f.onlyMyServices && services.length) {
    p.watch_region = kvGet<string>('region', 'US');
    p.with_watch_providers = services.join('|');
    p.with_watch_monetization_types = 'flatrate|free|ads';
  }
  return p;
}

type Page = { results: unknown[]; total_pages: number };

async function candidatesFor(type: MediaType, f: SessionFilters, exclude: Set<string>, want: number): Promise<Title[]> {
  const params = discoverParams(type, f);
  const first = await tmdb<Page>(`/discover/${type}`, { ...params, page: 1 }, 30 * 60 * 1000);
  const totalPages = Math.min(first.total_pages || 1, 25);
  // Random pages give variety each night, while still favouring popular titles.
  const pages = shuffle(Array.from({ length: totalPages - 1 }, (_, i) => i + 2)).slice(0, 4);
  const lists = [first, ...(await Promise.all(pages.map((page) => tmdb<Page>(`/discover/${type}`, { ...params, page }, 30 * 60 * 1000).catch(() => ({ results: [], total_pages: 0 })))))];
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

/** Pick fresh titles for a movie night and fetch full details for each card. */
export async function buildDeck(f: SessionFilters, size: number, extraExclude: Iterable<string> = []): Promise<Title[]> {
  const exclude = excludedKeys({ includeRewatches: f.includeRewatches, extra: extraExclude });

  let pool: Title[];
  if (f.source === 'watchlist') {
    const rows = db.prepare('SELECT key FROM watchlist').all() as { key: string }[];
    const watched = new Set((db.prepare('SELECT key FROM watched').all() as { key: string }[]).map((r) => r.key));
    const extra = new Set(extraExclude);
    const keys = rows
      .map((r) => r.key)
      .filter((k) => !extra.has(k) && (f.includeRewatches || !watched.has(k)))
      .filter((k) => f.type === 'both' || parseKey(k)?.type === f.type);
    pool = shuffle(keys).map((key) => ({ key }) as Title);
  } else {
    const types: MediaType[] = f.type === 'both' ? ['movie', 'tv'] : [f.type];
    const want = Math.ceil((size * 1.4) / types.length) + 2;
    const lists = await Promise.all(types.map((t) => candidatesFor(t, f, exclude, want)));
    // Interleave so "both" decks feel mixed, favouring movies roughly 60/40.
    pool = [];
    const [a, b = []] = lists;
    while (a.length || b.length) {
      if (a.length) pool.push(a.shift()!);
      if (a.length && Math.random() < 0.5) pool.push(a.shift()!);
      if (b.length) pool.push(b.shift()!);
    }
    rememberListItems(pool);
  }

  const picked = pool.slice(0, Math.ceil(size * 1.3));
  const detailed = await mapLimit(picked, 6, async (t) => {
    try {
      return snapshot(await getDetails(t.key));
    } catch {
      return null;
    }
  });
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
