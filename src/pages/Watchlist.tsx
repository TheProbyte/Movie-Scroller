import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Dices, Plus, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { PosterTile } from '../components/Poster';
import { Roulette } from '../components/Roulette';
import type { Title, WatchlistSection } from '../../shared/types';
import { DEFAULT_FILTERS } from '../../shared/types';

const SECTIONS: { id: WatchlistSection | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'both', label: 'Both want' },
  { id: 'maybe', label: 'Maybe later' },
  { id: 'saved', label: 'Saved' },
];

export function Watchlist() {
  const { openTitle } = useApp();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const [section, setSection] = useState<WatchlistSection | 'all'>('all');
  const [type, setType] = useState<'all' | 'movie' | 'tv'>('all');
  const [roulette, setRoulette] = useState<Title[] | null>(null);

  const entries = (q.data?.entries ?? []).filter((e) => q.data!.titles[e.key]);
  const visible = entries.filter((e) => (section === 'all' || e.section === section) && (type === 'all' || q.data!.titles[e.key].type === type));
  const titles = visible.map((e) => q.data!.titles[e.key]);
  const count = (s: WatchlistSection | 'all') => entries.filter((e) => s === 'all' || e.section === s).length;

  const startFromWatchlist = () => {
    try {
      localStorage.setItem('mm.lastFilters', JSON.stringify({ ...DEFAULT_FILTERS, source: 'watchlist', type }));
    } catch {
      /* ignore */
    }
    navigate('/night/new');
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h1 className="page-title">Our Watchlist</h1>
        <Link to="/discover?focus=1" className="icon-btn glass" aria-label="Add a title">
          <Plus size={20} />
        </Link>
      </div>
      <p className="page-sub" style={{ marginTop: 0, marginBottom: 16 }}>Everything you’re both keen on, saved for later.</p>

      <div className="tabs-scroll">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`chip ${section === s.id ? 'on' : ''}`} onClick={() => setSection(s.id)}>
            {s.label} <span className="faint">{count(s.id)}</span>
          </button>
        ))}
      </div>
      <div className="segmented" style={{ marginTop: 12 }}>
        {(['all', 'movie', 'tv'] as const).map((t) => (
          <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
            {t === 'all' ? 'Everything' : t === 'movie' ? 'Movies' : 'TV shows'}
          </button>
        ))}
      </div>

      {titles.length > 1 && (
        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button className="btn grow" onClick={() => setRoulette(titles)}>
            <Dices size={18} /> Roulette
          </button>
          <button className="btn grow" onClick={startFromWatchlist}>
            <Sparkles size={18} /> Swipe these
          </button>
        </div>
      )}

      {q.isLoading ? (
        <div className="center"><div className="spinner" /></div>
      ) : titles.length === 0 ? (
        <div className="empty">
          <div className="emoji">🍿</div>
          <h3>{entries.length ? 'Nothing here yet' : 'Your watchlist is empty'}</h3>
          <p>Matches from movie nights land here — or add titles from Discover.</p>
          <Link to="/discover" className="btn" style={{ marginTop: 8 }}>Browse titles</Link>
        </div>
      ) : (
        <div className="poster-grid" style={{ marginTop: 18 }}>
          {visible.map((e) => (
            <PosterTile
              key={e.key}
              title={q.data!.titles[e.key]}
              onClick={() => openTitle(e.key)}
              badge={e.section === 'both' ? <span className="tag glass-tag">💚 Both</span> : e.section === 'maybe' ? <span className="tag glass-tag">🤔 Maybe</span> : undefined}
            />
          ))}
        </div>
      )}

      <AnimatePresence>{roulette && (
          <Roulette
            titles={roulette}
            onClose={() => setRoulette(null)}
            onPick={(t) => {
              setRoulette(null);
              openTitle(t.key);
            }}
          />
        )}</AnimatePresence>
    </div>
  );
}
