import { chunk, kvGet, one, all, placeholders, stmt, batch, run } from './db.ts';
import { env, type D1Stmt } from './env.ts';
import type { Availability, MediaType, Person, Provider, Title, TitleDetails } from '../shared/types.ts';
import { parseKey, titleKey } from '../shared/types.ts';

const DEFAULT_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_IMAGES = 'https://image.tmdb.org/t/p';
const DETAILS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const LIST_TTL = 60 * 60 * 1000;

export const imageBase = () => env().TMDB_IMAGE_BASE ?? DEFAULT_IMAGES;

export class TmdbError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

// The stored key is read from the database; keep it for a bit instead of querying every call.
let keyCache: { value: string; at: number } | null = null;
export const clearKeyCache = () => {
  keyCache = null;
};

async function credentials(): Promise<{ apiKey?: string; token?: string }> {
  const e = env();
  if (e.TMDB_READ_TOKEN || e.TMDB_API_KEY) return { token: e.TMDB_READ_TOKEN || undefined, apiKey: e.TMDB_API_KEY || undefined };
  if (!keyCache || Date.now() - keyCache.at > 30_000) keyCache = { value: await kvGet<string>('tmdbKey', ''), at: Date.now() };
  const stored = keyCache.value;
  if (!stored) return {};
  // v4 read tokens are long JWTs, v3 keys are 32 hex chars.
  return stored.length > 40 ? { token: stored } : { apiKey: stored };
}

export async function tmdbConfigured(): Promise<boolean> {
  const c = await credentials();
  return Boolean(c.apiKey || c.token);
}

const listCache = new Map<string, { at: number; data: unknown }>();

export async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}, cacheMs = 0): Promise<T> {
  const { apiKey, token } = await credentials();
  if (!apiKey && !token) throw new TmdbError('TMDB is not configured yet', 503);
  const url = new URL((env().TMDB_BASE_URL ?? DEFAULT_BASE) + path);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const cacheKey = url.toString();
  if (cacheMs) {
    const hit = listCache.get(cacheKey);
    if (hit && Date.now() - hit.at < cacheMs) return hit.data as T;
  }
  if (apiKey) url.searchParams.set('api_key', apiKey);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  // Workers on the free plan allow 50 outbound requests per call, so retry sparingly.
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 700));
    res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  }
  if (!res.ok) throw new TmdbError(`TMDB ${res.status} for ${path}`, res.status === 401 ? 401 : res.status === 404 ? 404 : 502);
  const data = (await res.json()) as T;
  if (cacheMs) {
    if (listCache.size > 150) listCache.clear();
    listCache.set(cacheKey, { at: Date.now(), data });
  }
  return data;
}

export async function verifyTmdbKey(key: string): Promise<boolean> {
  const url = new URL((env().TMDB_BASE_URL ?? DEFAULT_BASE) + '/configuration');
  const headers: Record<string, string> = {};
  if (key.length > 40) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  return Boolean(res?.ok);
}

// ---------------------------------------------------------------------------
// Normalization

const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western',
};
const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function fromListItem(r: any, fallbackType?: MediaType): Title | null {
  const type: MediaType | undefined = r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : fallbackType;
  if (!type || !r.id) return null;
  const names = type === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return {
    key: titleKey(type, r.id),
    id: r.id,
    type,
    title: r.title ?? r.name ?? 'Untitled',
    year: yearOf(r.release_date ?? r.first_air_date),
    overview: r.overview ?? '',
    poster: r.poster_path ?? null,
    backdrop: r.backdrop_path ?? null,
    genres: (r.genre_ids ?? []).map((g: number) => names[g]).filter(Boolean),
    runtime: null,
    seasons: null,
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    voteCount: r.vote_count ?? 0,
    certification: null,
    availability: null,
  };
}

const provider = (p: any): Provider => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null });

function availability(raw: any, region: string): Availability | null {
  if (!raw) return null;
  const r = raw.results?.[region];
  if (!r) return { link: null, stream: [], free: [], rent: [], buy: [] };
  const uniq = (list: any[] = []) => {
    const seen = new Set<number>();
    return list.filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id)).map(provider);
  };
  return {
    link: r.link ?? null,
    stream: uniq(r.flatrate),
    free: uniq([...(r.free ?? []), ...(r.ads ?? [])]),
    rent: uniq(r.rent),
    buy: uniq(r.buy),
  };
}

/** Handles both the light card fetch and the full details fetch; missing sections are simply empty. */
function toDetails(d: any, type: MediaType, region: string): TitleDetails {
  const videos: any[] = d.videos?.results ?? [];
  const trailer =
    videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ??
    videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ??
    videos.find((v) => v.site === 'YouTube' && v.type === 'Teaser');

  let certification: string | null = null;
  if (type === 'movie') {
    const res = d.release_dates?.results;
    const rel = res?.find((x: any) => x.iso_3166_1 === region) ?? res?.find((x: any) => x.iso_3166_1 === 'US');
    certification = rel?.release_dates?.find((x: any) => x.certification)?.certification || null;
  } else {
    const res = d.content_ratings?.results;
    const cr = res?.find((x: any) => x.iso_3166_1 === region) ?? res?.find((x: any) => x.iso_3166_1 === 'US');
    certification = cr?.rating || null;
  }

  const cast: Person[] = (d.credits?.cast ?? []).slice(0, 16).map((c: any) => ({
    id: c.id, name: c.name, role: c.character || '', photo: c.profile_path ?? null,
  }));
  const crew: Person[] =
    type === 'movie'
      ? (d.credits?.crew ?? []).filter((c: any) => c.job === 'Director').map((c: any) => ({ id: c.id, name: c.name, role: 'Director', photo: c.profile_path ?? null }))
      : (d.created_by ?? []).map((c: any) => ({ id: c.id, name: c.name, role: 'Creator', photo: c.profile_path ?? null }));

  const runtime = type === 'movie' ? d.runtime || null : d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null;

  return {
    key: titleKey(type, d.id),
    id: d.id,
    type,
    title: d.title ?? d.name ?? 'Untitled',
    year: yearOf(d.release_date ?? d.first_air_date),
    overview: d.overview ?? '',
    poster: d.poster_path ?? null,
    backdrop: d.backdrop_path ?? null,
    genres: (d.genres ?? []).map((g: any) => g.name),
    runtime,
    seasons: type === 'tv' ? d.number_of_seasons ?? null : null,
    rating: Math.round((d.vote_average ?? 0) * 10) / 10,
    voteCount: d.vote_count ?? 0,
    certification,
    availability: availability(d['watch/providers'], region),
    tagline: d.tagline || null,
    cast,
    crew,
    trailer: trailer ? { key: trailer.key, name: trailer.name } : null,
    status: d.status ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function snapshot(d: TitleDetails): Title {
  const { tagline: _t, cast: _c, crew: _cr, trailer: _tr, status: _s, ...rest } = d;
  return rest;
}

// ---------------------------------------------------------------------------
// Title cache. Cards use a light fetch (base info + streaming); the details
// sheet loads the heavy extras (cast, trailer, ratings) on demand. That keeps
// building a deck cheap enough for Cloudflare's free-plan limits.

const UPSERT_CARD = `INSERT INTO titles (key, data, details, region, updated_at) VALUES (?, ?, NULL, ?, ?)
  ON CONFLICT(key) DO UPDATE SET data = excluded.data, region = excluded.region, updated_at = excluded.updated_at`;

/** Light card data. Pass `writes` to defer the cache write into a batch. */
export async function getTitle(key: string, region: string, writes?: D1Stmt[]): Promise<Title> {
  const parsed = parseKey(key);
  if (!parsed) throw new TmdbError('Bad title key', 400);
  const row = await one<{ data: string; region: string | null; updated_at: number }>('SELECT data, region, updated_at FROM titles WHERE key = ?', key);
  if (row && row.updated_at > 0 && row.region === region && Date.now() - row.updated_at < DETAILS_TTL_MS) return JSON.parse(row.data) as Title;
  try {
    const raw = await tmdb(`/${parsed.type}/${parsed.id}`, { append_to_response: 'watch/providers' });
    const t = snapshot(toDetails(raw, parsed.type, region));
    const w = stmt(UPSERT_CARD, key, JSON.stringify(t), region, Date.now());
    if (writes) writes.push(w);
    else await w.run();
    return t;
  } catch (e) {
    if (row) return JSON.parse(row.data) as Title; // serve stale rather than fail
    throw e;
  }
}

export async function getDetails(key: string, region: string): Promise<TitleDetails> {
  const parsed = parseKey(key);
  if (!parsed) throw new TmdbError('Bad title key', 400);
  const row = await one<{ details: string | null; region: string | null; updated_at: number }>('SELECT details, region, updated_at FROM titles WHERE key = ?', key);
  if (row?.details && row.region === region && Date.now() - row.updated_at < DETAILS_TTL_MS) return JSON.parse(row.details) as TitleDetails;
  try {
    const append = parsed.type === 'movie' ? 'videos,credits,watch/providers,release_dates' : 'videos,credits,watch/providers,content_ratings';
    const raw = await tmdb(`/${parsed.type}/${parsed.id}`, { append_to_response: append });
    const details = toDetails(raw, parsed.type, region);
    await run(
      `INSERT INTO titles (key, data, details, region, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, details = excluded.details, region = excluded.region, updated_at = excluded.updated_at`,
      key, JSON.stringify(snapshot(details)), JSON.stringify(details), region, Date.now(),
    );
    return details;
  } catch (e) {
    if (row?.details) return JSON.parse(row.details) as TitleDetails;
    throw e;
  }
}

/** Stored snapshots for many titles in one query; unknown ones are fetched (capped). */
export async function getTitles(keys: string[], region: string): Promise<Record<string, Title>> {
  const out: Record<string, Title> = {};
  const unique = [...new Set(keys)];
  if (!unique.length) return out;
  for (const part of chunk(unique, 80)) {
    const rows = await all<{ key: string; data: string }>(`SELECT key, data FROM titles WHERE key IN (${placeholders(part.length)})`, ...part);
    for (const r of rows) out[r.key] = JSON.parse(r.data) as Title;
  }
  const missing = unique.filter((k) => !out[k]).slice(0, 24);
  if (missing.length) {
    const writes: D1Stmt[] = [];
    await mapLimit(missing, 6, async (k) => {
      try {
        out[k] = await getTitle(k, region, writes);
      } catch {
        /* skip titles TMDB can't resolve */
      }
    });
    await batch(writes);
  }
  return out;
}

/** Remember list-item data for titles we have not fetched in full yet. */
export async function rememberListItems(items: Title[]) {
  await batch(items.map((t) => stmt('INSERT OR IGNORE INTO titles (key, data, details, region, updated_at) VALUES (?, ?, NULL, NULL, 0)', t.key, JSON.stringify(t))));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function listProviders(reg: string): Promise<Provider[]> {
  type Raw = { results: { provider_id: number; provider_name: string; logo_path: string; display_priorities?: Record<string, number>; display_priority?: number }[] };
  const day = 24 * 60 * 60 * 1000;
  const [m, t] = await Promise.all([
    tmdb<Raw>('/watch/providers/movie', { watch_region: reg }, day),
    tmdb<Raw>('/watch/providers/tv', { watch_region: reg }, day),
  ]);
  const byId = new Map<number, { p: Provider; priority: number }>();
  for (const r of [...m.results, ...t.results]) {
    const priority = r.display_priorities?.[reg] ?? r.display_priority ?? 999;
    const existing = byId.get(r.provider_id);
    if (!existing || priority < existing.priority) byId.set(r.provider_id, { p: provider(r), priority });
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority).map((x) => x.p);
}
