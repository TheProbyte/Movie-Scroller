import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import { Poster } from '../components/Poster';
import { StarRating } from '../components/StarRating';
import type { PlayerId } from '../../shared/types';

export function Watched() {
  const { openTitle, name } = useApp();
  const q = useQuery({ queryKey: ['watched'], queryFn: api.watched });
  const [view, setView] = useState<'timeline' | 'grid'>('timeline');
  const [type, setType] = useState<'all' | 'movie' | 'tv'>('all');

  const entries = (q.data?.entries ?? []).filter((e) => q.data!.titles[e.key] && (type === 'all' || q.data!.titles[e.key].type === type));
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const label = new Date(e.watchedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }

  return (
    <div className="page">
      <h1 className="page-title">Already Watched</h1>
      <p className="page-sub" style={{ marginBottom: 16 }}>
        {q.data ? `${q.data.entries.length} watched together` : ' '}
      </p>
      <div className="row" style={{ gap: 10 }}>
        <div className="segmented grow">
          {(['all', 'movie', 'tv'] as const).map((t) => (
            <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
              {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV'}
            </button>
          ))}
        </div>
        <div className="segmented" style={{ width: 132 }}>
          <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')} aria-label="Timeline view">☰</button>
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Grid view">▦</button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="center"><div className="spinner" /></div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <div className="emoji">🎬</div>
          <h3>Nothing watched yet</h3>
          <p>Mark titles as watched from their details page, your watchlist, or after a movie night.</p>
          <Link to="/discover" className="btn" style={{ marginTop: 8 }}>Find something</Link>
        </div>
      ) : view === 'grid' ? (
        <div className="poster-grid" style={{ marginTop: 18 }}>
          {entries.map((e) => {
            const t = q.data!.titles[e.key];
            return (
              <button key={e.key} onClick={() => openTitle(e.key)} style={{ textAlign: 'left' }}>
                <Poster title={t} />
                <div className="tile-title">{t.title}</div>
                <div className="tile-sub row" style={{ gap: 8 }}>
                  {([1, 2] as PlayerId[]).map((p) => e.ratings[p] != null && <span key={p} className={p === 1 ? 'p1' : 'p2'}>★ {e.ratings[p]}</span>)}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        [...groups.entries()].map(([label, list]) => (
          <section key={label}>
            <div className="section-title">{label}</div>
            <div className="timeline">
              {list.map((e) => {
                const t = q.data!.titles[e.key];
                return (
                  <button key={e.key} className="timeline-row" onClick={() => openTitle(e.key)}>
                    <Poster title={t} size="w185" className="timeline-poster" />
                    <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }} className="ellipsis">{t.title}</div>
                      <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
                        {new Date(e.watchedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {t.year}
                      </div>
                      {([1, 2] as PlayerId[]).map((p) => (
                        <div key={p} className="row" style={{ gap: 8, height: 20 }}>
                          <span className={p === 1 ? 'p1' : 'p2'} style={{ fontSize: 12, width: 64, fontWeight: 600 }} >
                            <span className="ellipsis" style={{ display: 'block' }}>{name(p)}</span>
                          </span>
                          {e.ratings[p] != null ? (
                            <StarRating value={e.ratings[p]} size={14} color={p === 1 ? 'var(--p1)' : 'var(--p2)'} />
                          ) : (
                            <span className="faint" style={{ fontSize: 12 }}>Tap to rate</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
