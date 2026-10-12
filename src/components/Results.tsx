import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BookmarkPlus, CheckCircle2, ChevronDown, Dices, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster, formatRuntime } from './Poster';
import { Roulette } from './Roulette';
import { VOTE_EMOJI } from './TitleSheet';
import type { PlayerId, SessionDetail, Title } from '../../shared/types';
import { GENRES, MOODS, PERIODS, RUNTIMES } from '../../shared/catalog';

export function filterSummary(s: Pick<SessionDetail, 'filters'>): string[] {
  const f = s.filters;
  const out: string[] = [];
  if (f.source === 'watchlist') out.push('From watchlist');
  out.push(f.type === 'both' ? 'Movies & TV' : f.type === 'movie' ? 'Movies' : 'TV');
  for (const g of f.genres) out.push(GENRES.find((x) => x.id === g)?.label ?? g);
  for (const m of f.moods) out.push(MOODS.find((x) => x.id === m)?.label ?? m);
  if (f.runtime !== 'any') out.push(RUNTIMES.find((r) => r.id === f.runtime)!.label);
  if (f.period !== 'any') out.push(PERIODS.find((p) => p.id === f.period)!.label);
  if (f.minRating) out.push(`${f.minRating}+ rated`);
  if (f.onlyMyServices) out.push('Our services');
  return out;
}

export function Results({ session }: { session: SessionDetail }) {
  const { name, openTitle, toast, me, img } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [roulette, setRoulette] = useState<Title[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showVotes, setShowVotes] = useState(false);
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });

  const byKey = new Map(session.deck.map((t) => [t.key, t]));
  const r = session.results!;
  const perfect = r.perfect.map((k) => byKey.get(k)!).filter(Boolean);
  const possible = r.possible.map((k) => byKey.get(k)!).filter(Boolean);
  const chosen = session.chosenKey ? byKey.get(session.chosenKey) : undefined;
  const onList = new Set(watchlist.data?.entries.map((e) => e.key) ?? []);
  const unsaved = [...r.perfect, ...r.possible].filter((k) => !onList.has(k));
  const refresh = () => qc.invalidateQueries({ queryKey: ['session', session.id] });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const choose = (t: Title) =>
    run('choose', async () => {
      await api.choose(session.id, t.key);
      setRoulette(null);
      refresh();
      toast(`🍿 Tonight: ${t.title}`);
    });

  const saveAll = () =>
    run('save', async () => {
      await api.addToWatchlist(
        [...r.perfect.map((key) => ({ key, section: 'both' as const })), ...r.possible.map((key) => ({ key, section: 'maybe' as const }))],
        { sessionId: session.id, addedBy: me ?? undefined },
      );
      qc.invalidateQueries({ queryKey: ['watchlist'] });
      toast(`Saved ${r.perfect.length + r.possible.length} to your watchlist`);
    });

  const more = () =>
    run('more', async () => {
      await api.more(session.id, 10);
      await refresh();
    });

  const again = () =>
    run('again', async () => {
      const { id } = await api.createSession({
        mode: session.mode,
        filters: session.filters,
        createdBy: me ?? session.createdBy,
        firstPlayer: session.mode === 'pass' ? session.firstPlayer : me ?? session.createdBy,
      });
      navigate(`/night/${id}`);
    });

  const pool = perfect.length ? perfect : possible;
  const date = new Date(session.createdAt);

  return (
    <div className="page no-tabs results">
      <div className="ambient" aria-hidden>
        {(chosen ?? perfect[0] ?? possible[0])?.poster && <img src={img((chosen ?? perfect[0] ?? possible[0])!.poster, 'w185')!} alt="" />}
      </div>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <button className="icon-btn glass" onClick={() => navigate('/')} aria-label="Home">
          <X size={20} />
        </button>
        <span className="faint" style={{ fontSize: 13 }}>
          {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>

      <h1 className="page-title">{perfect.length ? 'Your matches' : possible.length ? 'Almost there' : 'No matches'}</h1>
      <div className="chips" style={{ marginTop: 10 }}>
        {filterSummary(session).map((x) => (
          <span key={x} className="tag">{x}</span>
        ))}
      </div>

      <AnimatePresence>
        {chosen && (
          <motion.div className="chosen card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Poster title={chosen} size="w185" className="chosen-poster" />
            <div className="grow">
              <div className="eyebrow" style={{ margin: 0 }}>Tonight’s pick</div>
              <div className="display" style={{ fontSize: 24, lineHeight: 1.1 }}>{chosen.title}</div>
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm primary" onClick={() => openTitle(chosen.key)}>
                  <CheckCircle2 size={16} /> Watched? Rate it
                </button>
                <button className="btn sm" onClick={() => run('choose', async () => { await api.choose(session.id, null); refresh(); })}>
                  Change
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {perfect.length > 0 && (
        <>
          <div className="section-title">
            <span>💚 Perfect matches</span>
            <span>{perfect.length}</span>
          </div>
          <div className="match-carousel">
            {perfect.map((t, i) => (
              <motion.button
                key={t.key}
                className="match-card"
                onClick={() => openTitle(t.key, { sessionId: session.id })}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Poster title={t} size="w500" eager={i < 3} />
                <div className="match-card-info">
                  <div className="tile-title" style={{ fontSize: 15 }}>{t.title}</div>
                  <div className="tile-sub row" style={{ gap: 6 }}>
                    {t.year}
                    {formatRuntime(t) && <> · {formatRuntime(t)}</>}
                    {t.rating > 0 && (
                      <>
                        {' '}· <Star size={11} fill="var(--accent)" color="var(--accent)" /> {t.rating.toFixed(1)}
                      </>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {perfect.length === 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <strong>{possible.length ? 'No perfect matches this time.' : 'Nothing you both liked this round.'}</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            {possible.length ? 'But there are a few you’re both open to — or deal some more cards.' : 'Deal more cards, or try a fresh round with different filters.'}
          </p>
        </div>
      )}

      {possible.length > 0 && (
        <>
          <div className="section-title">
            <span>🤔 Possible matches</span>
            <span>{possible.length}</span>
          </div>
          <div className="poster-grid">
            {possible.map((t) => (
              <button key={t.key} style={{ textAlign: 'left', position: 'relative' }} onClick={() => openTitle(t.key, { sessionId: session.id })}>
                <Poster title={t} />
                <span className="vote-badge glass">
                  {VOTE_EMOJI[r.votes[t.key][1]!]} {VOTE_EMOJI[r.votes[t.key][2]!]}
                </span>
                <div className="tile-title">{t.title}</div>
                <div className="tile-sub">{t.year}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="results-actions">
        {pool.length > 1 && (
          <button className="btn primary lg block" onClick={() => setRoulette(pool)}>
            <Dices size={20} /> Movie Roulette
          </button>
        )}
        {pool.length === 1 && !chosen && (
          <button className="btn primary lg block" onClick={() => choose(pool[0])}>
            🍿 Watch {pool[0].title}
          </button>
        )}
        {unsaved.length > 0 && (
          <button className="btn lg block" disabled={busy === 'save'} onClick={saveAll}>
            <BookmarkPlus size={20} /> Save matches to watchlist
          </button>
        )}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn grow" disabled={!!busy} onClick={more}>
            <Plus size={18} /> {busy === 'more' ? 'Dealing…' : '10 more titles'}
          </button>
          <button className="btn grow" disabled={!!busy} onClick={again}>
            <RefreshCw size={18} /> {busy === 'again' ? 'Shuffling…' : 'New round'}
          </button>
        </div>
      </div>

      <button className="section-title" style={{ width: '100%', cursor: 'pointer' }} onClick={() => setShowVotes((v) => !v)}>
        <span>How we voted · {session.deck.length} titles</span>
        <ChevronDown size={16} style={{ transform: showVotes ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
      </button>
      {showVotes && (
        <div className="stack" style={{ gap: 8 }}>
          {session.deck.map((t) => (
            <button key={t.key} className="vote-row" onClick={() => openTitle(t.key)}>
              <Poster title={t} size="w185" className="vote-row-poster" />
              <div className="grow" style={{ textAlign: 'left' }}>
                <div className="ellipsis" style={{ fontWeight: 600 }}>{t.title}</div>
                <div className="faint" style={{ fontSize: 12 }}>{t.year}</div>
              </div>
              {([1, 2] as PlayerId[]).map((p) => (
                <div key={p} className="vote-chip" data-vote={r.votes[t.key]?.[p] ?? 'none'}>
                  <span className={p === 1 ? 'p1' : 'p2'} style={{ fontSize: 10, fontWeight: 700 }}>{name(p).slice(0, 8)}</span>
                  <span>{r.votes[t.key]?.[p] ? VOTE_EMOJI[r.votes[t.key][p]!] : '—'}</span>
                </div>
              ))}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn ghost sm"
        style={{ margin: '28px auto 0', display: 'flex', color: 'var(--text-3)' }}
        onClick={() => {
          if (!confirm('Delete this movie night from your history?')) return;
          run('delete', async () => {
            await api.deleteSession(session.id);
            qc.invalidateQueries({ queryKey: ['sessions'] });
            navigate('/history');
          });
        }}
      >
        <Trash2 size={14} /> Delete from history
      </button>

      <AnimatePresence>{roulette && <Roulette titles={roulette} onClose={() => setRoulette(null)} onPick={choose} />}</AnimatePresence>
    </div>
  );
}
