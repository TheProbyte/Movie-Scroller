import { test } from 'node:test';
import assert from 'node:assert/strict';
const { classifyMatch, DEFAULT_FILTERS } = await import('../shared/types.ts');
const { periodRange } = await import('../shared/catalog.ts');
const { discoverParams } = await import('./deck.ts');
const cfg = { region: 'US', services: [] as number[] };

test('match classification follows yes/maybe/no rules', () => {
  assert.equal(classifyMatch('yes', 'yes'), 'perfect');
  assert.equal(classifyMatch('yes', 'maybe'), 'possible');
  assert.equal(classifyMatch('maybe', 'maybe'), 'possible');
  assert.equal(classifyMatch('yes', 'no'), null);
  assert.equal(classifyMatch('no', 'no'), null);
  assert.equal(classifyMatch('yes', undefined), null);
});

test('genres map onto TMDB ids per media type', () => {
  const movie = discoverParams('movie', { ...DEFAULT_FILTERS, genres: ['scifi', 'comedy'] }, cfg);
  assert.equal(movie.with_genres, '878|35');
  const tv = discoverParams('tv', { ...DEFAULT_FILTERS, genres: ['scifi'] }, cfg);
  assert.equal(tv.with_genres, '10765');
});

test('moods only apply when no genres are picked', () => {
  const p = discoverParams('movie', { ...DEFAULT_FILTERS, moods: ['scary'] }, cfg);
  assert.equal(p.with_genres, '27|53');
  const q = discoverParams('movie', { ...DEFAULT_FILTERS, moods: ['scary'], genres: ['comedy'] }, cfg);
  assert.equal(q.with_genres, '35');
});

test('runtime, rating and service filters', () => {
  const mine = { region: 'GB', services: [8, 337] };
  const p = discoverParams('movie', { ...DEFAULT_FILTERS, runtime: 'short', minRating: 7, onlyMyServices: true }, mine);
  assert.equal(p['with_runtime.lte'], 90);
  assert.equal(p['vote_average.gte'], 7);
  assert.equal(p.with_watch_providers, '8|337');
  assert.equal(p.watch_region, 'GB');
  const tv = discoverParams('tv', { ...DEFAULT_FILTERS, runtime: 'short' }, cfg);
  assert.equal(tv['with_runtime.lte'], undefined);
});

test('decade ranges', () => {
  assert.deepEqual(periodRange('1990s'), { gte: '1990-01-01', lte: '1999-12-31' });
  assert.deepEqual(periodRange('classic'), { lte: '1979-12-31' });
  assert.deepEqual(periodRange('any'), {});
});
