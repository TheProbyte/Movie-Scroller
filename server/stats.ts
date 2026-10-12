import { db } from './db.ts';
import { getTitles } from './tmdb.ts';
import type { PlayerId, StatsGenre, TasteStats, Vote } from '../shared/types.ts';
import { classifyMatch } from '../shared/types.ts';

const keen = (v: Vote) => (v === 'yes' ? 1 : v === 'maybe' ? 0.5 : 0);
const pct = (n: number, d: number) => (d ? n / d : 0);

export async function tasteStats(): Promise<TasteStats> {
  // Latest vote per player per title, across every movie night.
  const rows = db
    .prepare(
      `SELECT v.player, v.key, v.vote FROM votes v
       JOIN (SELECT player, key, MAX(voted_at) AS at FROM votes GROUP BY player, key) l
         ON l.player = v.player AND l.key = v.key AND l.at = v.voted_at`,
    )
    .all() as { player: PlayerId; key: string; vote: Vote }[];
  const byKey = new Map<string, Partial<Record<PlayerId, Vote>>>();
  for (const r of rows) {
    const e = byKey.get(r.key) ?? {};
    e[r.player] = r.vote;
    byKey.set(r.key, e);
  }

  const watchedRows = db.prepare('SELECT key, rating1, rating2, watched_at FROM watched ORDER BY watched_at DESC').all() as {
    key: string;
    rating1: number | null;
    rating2: number | null;
  }[];

  const titles = await getTitles([...byKey.keys(), ...watchedRows.map((w) => w.key)]);

  let shared = 0;
  let agree = 0;
  const genreAgg = new Map<string, { votes: number; agree: number; keen: Record<PlayerId, number> }>();
  const fav: Record<PlayerId, Map<string, number>> = { 1: new Map(), 2: new Map() };
  const yes: Record<PlayerId, { n: number; d: number }> = { 1: { n: 0, d: 0 }, 2: { n: 0, d: 0 } };
  const splits: { key: string; lover: PlayerId }[] = [];

  for (const [key, v] of byKey) {
    const genres = titles[key]?.genres ?? [];
    for (const p of [1, 2] as PlayerId[]) {
      const vote = v[p];
      if (!vote) continue;
      yes[p].d++;
      if (vote === 'yes') {
        yes[p].n++;
        for (const g of genres) fav[p].set(g, (fav[p].get(g) ?? 0) + 1);
      }
    }
    if (!v[1] || !v[2]) continue;
    shared++;
    const together = (v[1] !== 'no') === (v[2] !== 'no');
    if (together) agree++;
    if ((v[1] === 'yes' && v[2] === 'no') || (v[2] === 'yes' && v[1] === 'no')) splits.push({ key, lover: v[1] === 'yes' ? 1 : 2 });
    for (const g of genres) {
      const a = genreAgg.get(g) ?? { votes: 0, agree: 0, keen: { 1: 0, 2: 0 } };
      a.votes++;
      if (together) a.agree++;
      a.keen[1] += keen(v[1]);
      a.keen[2] += keen(v[2]);
      genreAgg.set(g, a);
    }
  }

  const genres: StatsGenre[] = [...genreAgg.entries()]
    .map(([genre, a]) => ({
      genre,
      votes: a.votes,
      agreement: pct(a.agree, a.votes),
      yesRate: { 1: pct(a.keen[1], a.votes), 2: pct(a.keen[2], a.votes) },
    }))
    .sort((a, b) => b.votes - a.votes);

  const favoriteGenres = {
    1: [...fav[1].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([genre, n]) => ({ genre, yes: n })),
    2: [...fav[2].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([genre, n]) => ({ genre, yes: n })),
  };

  // Matches counted per completed movie night.
  let perfectMatches = 0;
  let possibleMatches = 0;
  const sessionVotes = db
    .prepare(
      `SELECT v.session_id, v.key,
              MAX(CASE WHEN v.player = 1 THEN v.vote END) AS a,
              MAX(CASE WHEN v.player = 2 THEN v.vote END) AS b
       FROM votes v JOIN sessions s ON s.id = v.session_id
       WHERE s.status = 'complete'
       GROUP BY v.session_id, v.key`,
    )
    .all() as { a: Vote | null; b: Vote | null }[];
  for (const r of sessionVotes) {
    const m = classifyMatch(r.a ?? undefined, r.b ?? undefined);
    if (m === 'perfect') perfectMatches++;
    else if (m === 'possible') possibleMatches++;
  }

  const avg = (vals: (number | null)[]) => {
    const xs = vals.filter((x): x is number => x != null);
    return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  };
  const ratingGaps = watchedRows
    .filter((w) => w.rating1 != null && w.rating2 != null && Math.abs(w.rating1 - w.rating2) >= 1.5)
    .slice(0, 8)
    .map((w) => ({ key: w.key, ratings: { 1: w.rating1!, 2: w.rating2! } }));

  const sessions = (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status = 'complete'").get() as { n: number }).n;
  const keep = new Set([...splits.slice(0, 12).map((s) => s.key), ...ratingGaps.map((r) => r.key)]);

  return {
    sharedVotes: shared,
    agreement: pct(agree, shared),
    sessions,
    perfectMatches,
    possibleMatches,
    watchedTogether: watchedRows.length,
    avgRating: { 1: avg(watchedRows.map((w) => w.rating1)), 2: avg(watchedRows.map((w) => w.rating2)) },
    yesRate: { 1: pct(yes[1].n, yes[1].d), 2: pct(yes[2].n, yes[2].d) },
    favoriteGenres,
    genres,
    splits: splits.slice(0, 12),
    ratingGaps,
    titles: Object.fromEntries(Object.entries(titles).filter(([k]) => keep.has(k))),
  };
}
