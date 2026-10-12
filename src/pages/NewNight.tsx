import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Shuffle, Smartphone, Users } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeader } from '../components/PageHeader';
import { Poster } from '../components/Poster';
import { GENRES, MOODS, PERIODS, RATINGS, RUNTIMES } from '../../shared/catalog';
import type { PlayerId, SessionFilters, SessionMode } from '../../shared/types';
import { DEFAULT_FILTERS } from '../../shared/types';

const FILTERS_KEY = 'mm.lastFilters';
const MODE_KEY = 'mm.lastMode';

function loadFilters(): SessionFilters {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function Toggle({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: React.ReactNode; disabled?: boolean }) {
  return (
    <button className="toggle-row" onClick={() => !disabled && onChange(!on)} aria-pressed={on} disabled={disabled}>
      <div className="grow" style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div className="faint" style={{ fontSize: 13 }}>{sub}</div>}
      </div>
      <span className={`switch ${on ? 'on' : ''}`} />
    </button>
  );
}

export function NewNight() {
  const { boot, name, me, toast, img } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState<SessionFilters>(loadFilters);
  const [mode, setMode] = useState<SessionMode>(() => (localStorage.getItem(MODE_KEY) as SessionMode) || 'pass');
  const [first, setFirst] = useState<PlayerId>(me ?? 1);
  const [loading, setLoading] = useState(false);
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const providers = useQuery({ queryKey: ['providers', boot.settings.region], queryFn: () => api.providers(boot.settings.region), staleTime: Infinity });
  const rails = useQuery({ queryKey: ['rails'], queryFn: api.rails, staleTime: 10 * 60_000 });

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [f, mode]);

  const set = <K extends keyof SessionFilters>(k: K, v: SessionFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleIn = (k: 'genres' | 'moods', id: string) => setF((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((g) => g !== id) : [...x[k], id] }));

  const myServices = (providers.data ?? []).filter((p) => boot.settings.services.includes(p.id));
  const wlCount = watchlist.data?.entries.length ?? 0;
  const fromWatchlist = f.source === 'watchlist';

  const start = async (filters: SessionFilters) => {
    setLoading(true);
    try {
      const creator = me ?? first;
      const { id } = await api.createSession({ mode, filters, createdBy: creator, firstPlayer: mode === 'pass' ? first : creator });
      navigate(`/night/${id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message);
      setLoading(false);
    }
  };

  const surprise = () => start({ ...DEFAULT_FILTERS, size: f.size, onlyMyServices: f.onlyMyServices && boot.settings.services.length > 0 });

  return (
    <div className="page no-tabs new-night">
      <PageHeader back="/" title="Movie Night" sub="Set the vibe, or let fate decide." />

      <div className="section-title" style={{ marginTop: 0 }}>How are you playing?</div>
      <div className="mode-grid">
        <button className={`mode-card ${mode === 'pass' ? 'on' : ''}`} onClick={() => setMode('pass')}>
          <Smartphone size={22} />
          <strong>One phone</strong>
          <span className="faint">Take turns, pass & play</span>
        </button>
        <button className={`mode-card ${mode === 'duo' ? 'on' : ''}`} onClick={() => setMode('duo')}>
          <Users size={22} />
          <strong>Two phones</strong>
          <span className="faint">Get a code to share</span>
        </button>
      </div>

      {mode === 'pass' && (
        <div style={{ marginTop: 14 }}>
          <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>Who swipes first?</div>
          <div className="segmented">
            {([1, 2] as PlayerId[]).map((p) => (
              <button key={p} className={first === p ? 'on' : ''} onClick={() => setFirst(p)}>
                {name(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="surprise" onClick={surprise} disabled={loading}>
        <Shuffle size={20} />
        <div className="grow" style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700 }}>Surprise us</div>
          <div className="faint" style={{ fontSize: 13 }}>Skip the filters — deal {f.size} random crowd‑pleasers</div>
        </div>
      </button>

      <div className="section-title">What to swipe on</div>
      <div className="segmented">
        <button className={!fromWatchlist ? 'on' : ''} onClick={() => set('source', 'discover')}>
          Discover new
        </button>
        <button className={fromWatchlist ? 'on' : ''} onClick={() => set('source', 'watchlist')}>
          Our watchlist ({wlCount})
        </button>
      </div>

      <div className="section-title">Type</div>
      <div className="segmented">
        {(['movie', 'tv', 'both'] as const).map((t) => (
          <button key={t} className={f.type === t ? 'on' : ''} onClick={() => set('type', t)}>
            {t === 'movie' ? 'Movies' : t === 'tv' ? 'TV shows' : 'Both'}
          </button>
        ))}
      </div>

      {!fromWatchlist && (
        <>
          <div className="section-title">
            <span>Mood</span>
            {f.moods.length > 0 && <button onClick={() => set('moods', [])} className="clear">Clear</button>}
          </div>
          <div className="chips">
            {MOODS.map((m) => (
              <button key={m.id} className={`chip ${f.moods.includes(m.id) ? 'on' : ''}`} onClick={() => toggleIn('moods', m.id)}>
                <span>{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>

          <div className="section-title">
            <span>Genres</span>
            {f.genres.length > 0 && <button onClick={() => set('genres', [])} className="clear">Clear</button>}
          </div>
          <div className="chips">
            {GENRES.map((g) => (
              <button key={g.id} className={`chip ${f.genres.includes(g.id) ? 'on' : ''}`} onClick={() => toggleIn('genres', g.id)}>
                <span>{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>
          {f.genres.length > 0 && f.moods.length > 0 && <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>Genres take priority over moods when both are picked.</p>}

          <div className="section-title">Runtime</div>
          <div className="chips">
            {RUNTIMES.map((r) => (
              <button key={r.id} className={`chip ${f.runtime === r.id ? 'on' : ''}`} onClick={() => set('runtime', r.id)}>
                {r.label}
              </button>
            ))}
          </div>

          <div className="section-title">Released</div>
          <div className="chips">
            {PERIODS.map((p) => (
              <button key={p.id} className={`chip ${f.period === p.id ? 'on' : ''}`} onClick={() => set('period', p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="section-title">Audience rating</div>
          <div className="chips">
            {RATINGS.map((r) => (
              <button key={r.value} className={`chip ${f.minRating === r.value ? 'on' : ''}`} onClick={() => set('minRating', r.value)}>
                {r.value ? `★ ${r.label}` : r.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Options</div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {!fromWatchlist && (
          <Toggle
            on={f.onlyMyServices && myServices.length > 0}
            onChange={(v) => set('onlyMyServices', v)}
            disabled={boot.settings.services.length === 0}
            label="Only on our services"
            sub={
              boot.settings.services.length === 0 ? (
                <>
                  Pick your services in <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>
                </>
              ) : (
                <span className="row" style={{ gap: 4, marginTop: 4 }}>
                  {myServices.slice(0, 8).map((p) => p.logo && <img key={p.id} src={img(p.logo, 'w92')!} alt={p.name} className="svc-logo" />)}
                </span>
              )
            }
          />
        )}
        <Toggle on={f.includeRewatches} onChange={(v) => set('includeRewatches', v)} label="Include rewatches" sub="Show titles we’ve already seen" />
      </div>

      <div className="section-title">How many titles</div>
      <div className="segmented">
        {[10, 20, 30].map((n) => (
          <button key={n} className={f.size === n ? 'on' : ''} onClick={() => set('size', n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="sticky-cta">
        <button className="btn primary lg block" disabled={loading || (fromWatchlist && wlCount === 0)} onClick={() => start(f)}>
          {fromWatchlist && wlCount === 0 ? 'Your watchlist is empty' : `Deal ${f.size} cards`}
        </button>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div className="dealing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="fan">
              {(rails.data?.trending ?? []).slice(0, 5).map((t, i) => (
                <motion.div
                  key={t.key}
                  className="fan-card"
                  animate={{ rotate: [(i - 2) * 2, (i - 2) * 10, (i - 2) * 2], x: [(i - 2) * 6, (i - 2) * 36, (i - 2) * 6] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                >
                  <Poster title={t} size="w185" eager />
                </motion.div>
              ))}
            </div>
            <h2 className="display" style={{ fontSize: 30 }}>Shuffling the deck…</h2>
            <p className="muted">Finding {f.size} titles you might both love</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
