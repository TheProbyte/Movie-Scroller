import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster, PosterTile } from '../components/Poster';
import type { Rails, Title } from '../../shared/types';

const RAILS: { key: keyof Rails; label: string }[] = [
  { key: 'forYou', label: 'Picked for you two' },
  { key: 'trending', label: 'Trending this week' },
  { key: 'onOurServices', label: 'On your services' },
  { key: 'newReleases', label: 'New releases' },
  { key: 'popularTv', label: 'Popular TV' },
  { key: 'classics', label: 'Timeless classics' },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Discover() {
  const { openTitle } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q.trim(), 350);
  const input = useRef<HTMLInputElement>(null);
  const rails = useQuery({ queryKey: ['rails'], queryFn: api.rails, staleTime: 10 * 60_000 });
  const results = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: dq.length > 1 });
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const saved = new Set(watchlist.data?.entries.map((e) => e.key));

  useEffect(() => {
    if (params.get('focus')) {
      input.current?.focus();
      const next = new URLSearchParams(params);
      next.delete('focus');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = (t: Title) => (saved.has(t.key) ? <span className="tag glass-tag">✓ Saved</span> : undefined);

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 16 }}>Discover</h1>
      <div className="search">
        <Search size={18} className="faint" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies & shows" enterKeyHint="search" aria-label="Search" />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search" className="faint">
            <X size={18} />
          </button>
        )}
      </div>

      {dq.length > 1 ? (
        results.isLoading ? (
          <div className="center" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : results.data?.length ? (
          <div className="poster-grid" style={{ marginTop: 18 }}>
            {results.data.map((t) => (
              <PosterTile key={t.key} title={t} onClick={() => openTitle(t.key)} badge={badge(t)} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="emoji">🔍</div>
            <h3>No results</h3>
            <p>Try a different title or spelling.</p>
          </div>
        )
      ) : rails.isLoading ? (
        <div className="stack" style={{ marginTop: 24 }}>
          {[0, 1].map((i) => (
            <div key={i} className="rail">
              {[0, 1, 2, 3].map((j) => <div key={j} className="poster skeleton" />)}
            </div>
          ))}
        </div>
      ) : rails.isError ? (
        <div className="empty"><div className="emoji">📡</div><p>{(rails.error as Error).message}</p></div>
      ) : (
        RAILS.filter((r) => rails.data![r.key].length).map((r) => (
          <section key={r.key}>
            <div className="section-title">{r.label}</div>
            <div className="rail">
              {rails.data![r.key].slice(0, 20).map((t) => (
                <button key={t.key} onClick={() => openTitle(t.key)} style={{ textAlign: 'left', position: 'relative' }}>
                  <Poster title={t} size="w342" />
                  {saved.has(t.key) && <span className="tag glass-tag" style={{ position: 'absolute', top: 6, left: 6 }}>✓</span>}
                  <div className="tile-title">{t.title}</div>
                  <div className="tile-sub">{[t.year, t.type === 'tv' ? 'Series' : null].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
