import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Check, CheckCircle2, ExternalLink, Play, Popcorn, Star, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster, Starburst, formatRuntime } from './Poster';
import { sfx } from '../sound';
import { StarRating } from './StarRating';
import type { PlayerId, Provider, Vote, WatchlistSection } from '../../shared/types';

const SECTION_LABEL: Record<WatchlistSection, string> = { both: 'Both want to watch', maybe: 'Maybe later', saved: 'Saved' };
export const VOTE_EMOJI: Record<Vote, string> = { yes: '💚', maybe: '🤔', no: '✕' };

export function useCloseSheet() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1);
    else {
      const params = new URLSearchParams(location.search);
      params.delete('t');
      params.delete('s');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  };
}

export function TitleSheet({ titleKey, sessionId }: { titleKey: string; sessionId: string | null }) {
  const { img, name, me, toast, boot } = useApp();
  const close = useCloseSheet();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['title', titleKey], queryFn: () => api.title(titleKey) });
  const [playing, setPlaying] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['title', titleKey] });
    qc.invalidateQueries({ queryKey: ['watchlist'] });
    qc.invalidateQueries({ queryKey: ['watched'] });
  };
  const mutate = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: invalidate,
    onError: (e: Error) => toast(e.message),
  });

  const d = q.data?.details;
  const state = q.data?.state;
  const services = new Set(boot.settings.services);

  return (
    <>
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        className="sheet detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={d?.title ?? 'Title details'}
        initial={{ y: '100%', x: '-50%' }}
        animate={{ y: 0, x: '-50%' }}
        exit={{ y: '100%', x: '-50%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      >
        <div className="win-bar">
          <span aria-hidden>📀</span>
          <span className="win-title">{d ? `${d.title} — Info` : 'Loading…'}</span>
          <button className="win-close" onClick={close} aria-label="Close">
            <X size={14} strokeWidth={3} />
          </button>
        </div>

        {!d ? (
          <div className="center" style={{ minHeight: '60dvh' }}>
            {q.isError ? <p>{(q.error as Error).message}</p> : <div className="spinner" />}
          </div>
        ) : (
          <>
            <div className="detail-hero">
              {d.backdrop ? <img src={img(d.backdrop, 'w1280')!} alt="" /> : <div className="detail-hero-fallback" />}
              <div className="detail-hero-fade" />
            </div>

            <div className="detail-body">
              <div className="row" style={{ alignItems: 'flex-end', gap: 16, marginTop: -110 }}>
                <Poster title={d} size="w342" className="detail-poster" eager band />
                <div className="grow" style={{ paddingBottom: 4 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <span className={`type-pill ${d.type}`}>{d.type === 'tv' ? 'TV SERIES' : 'MOVIE'}</span>
                    {d.rating > 0 && (
                      <Starburst className="detail-burst">
                        ★<b>{d.rating.toFixed(1)}</b>
                      </Starburst>
                    )}
                  </div>
                  <h2 className="detail-title">{d.title}</h2>
                </div>
              </div>

              <div className="detail-meta">
                {[d.year, formatRuntime(d), d.certification].filter(Boolean).map((x) => (
                  <span key={String(x)}>{x}</span>
                ))}
                {d.rating > 0 && (
                  <span className="row" style={{ gap: 4 }}>
                    <Star size={14} fill="var(--gold)" color="var(--gold)" /> {d.rating.toFixed(1)}
                    <span className="faint">({d.voteCount.toLocaleString()} votes)</span>
                  </span>
                )}
              </div>
              {d.genres.length > 0 && (
                <div className="chips" style={{ marginTop: 12 }}>
                  {d.genres.map((g) => (
                    <span key={g} className="tag">{g}</span>
                  ))}
                </div>
              )}

              {sessionId && (
                <button
                  className="btn primary lg block"
                  style={{ marginTop: 20 }}
                  onClick={async () => {
                    await api.choose(sessionId, d.key);
                    sfx.land();
                    qc.invalidateQueries({ queryKey: ['session', sessionId] });
                    toast(`🍿 Tonight: ${d.title}`);
                    close();
                  }}
                >
                  <Popcorn size={20} /> Watch this tonight
                </button>
              )}

              <div className="detail-actions">
                {state?.watchlist ? (
                  <button className="btn on-list" onClick={() => mutate.mutate(() => api.removeFromWatchlist(d.key))}>
                    <BookmarkCheck size={18} /> {SECTION_LABEL[state.watchlist.section]}
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() =>
                      mutate.mutate(async () => {
                        await api.addToWatchlist([{ key: d.key, section: 'saved' }], { addedBy: me ?? undefined });
                        sfx.bling();
                        toast('Saved to your watchlist ★');
                      })
                    }
                  >
                    <Bookmark size={18} /> Watchlist
                  </button>
                )}
                {state?.watched ? (
                  <button className="btn on-list" onClick={() => mutate.mutate(() => api.unmarkWatched(d.key))}>
                    <CheckCircle2 size={18} /> Watched
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() =>
                      mutate.mutate(async () => {
                        await api.markWatched(d.key, sessionId ?? undefined);
                        sfx.bling();
                        toast('Marked as watched — rate it below');
                      })
                    }
                  >
                    <Check size={18} /> Watched
                  </button>
                )}
              </div>

              {state?.watched && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="row between" style={{ marginBottom: 10 }}>
                    <strong>Our ratings</strong>
                    <span className="faint" style={{ fontSize: 13 }}>
                      Watched {new Date(state.watched.watchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {([1, 2] as PlayerId[]).map((p) => (
                    <div key={p} className="row between" style={{ padding: '6px 0' }}>
                      <span className={p === 1 ? 'p1' : 'p2'} style={{ fontWeight: 600 }}>{name(p)}</span>
                      <StarRating
                        value={state.watched!.ratings[p]}
                        color={p === 1 ? 'var(--p1)' : 'var(--p2)'}
                        onChange={(v) => {
                          sfx.tick();
                          mutate.mutate(() => api.rate(d.key, p, v));
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {d.tagline && <p className="detail-tagline">“{d.tagline}”</p>}
              <p className="detail-overview">{d.overview || 'No synopsis available yet.'}</p>

              {d.trailer && (
                <>
                  <div className="section-title">Trailer</div>
                  <div className="trailer">
                    {playing ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${d.trailer.key}?autoplay=1&playsinline=1&rel=0`}
                        title={d.trailer.name}
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                      />
                    ) : (
                      <button onClick={() => setPlaying(true)} aria-label="Play trailer">
                        <img src={`https://i.ytimg.com/vi/${d.trailer.key}/hqdefault.jpg`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                        <span className="trailer-play">
                          <Play size={26} fill="currentColor" />
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}

              <WhereToWatch availability={d.availability} services={services} />

              {d.crew.length > 0 && (
                <p style={{ marginTop: 22 }} className="muted">
                  {d.crew[0].role === 'Director' ? 'Directed by ' : 'Created by '}
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.crew.map((c) => c.name).join(', ')}</span>
                </p>
              )}

              {d.cast.length > 0 && (
                <>
                  <div className="section-title">Cast</div>
                  <div className="rail cast-rail">
                    {d.cast.map((c) => (
                      <div key={c.id + c.role} className="cast">
                        <div className="cast-photo">{c.photo ? <img src={img(c.photo, 'w185')!} alt="" loading="lazy" /> : <span>{c.name[0]}</span>}</div>
                        <div className="tile-title" style={{ fontSize: 12 }}>{c.name}</div>
                        <div className="tile-sub" style={{ fontSize: 11 }}>{c.role}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {q.data!.history.length > 0 && (
                <>
                  <div className="section-title">On our movie nights</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {q.data!.history.map((h) => (
                      <button key={h.sessionId} className="card row between" style={{ padding: '12px 14px' }} onClick={() => navigate(`/night/${h.sessionId}`)}>
                        <span className="muted">{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span className="row" style={{ gap: 12, fontSize: 14 }}>
                          {([1, 2] as PlayerId[]).map((p) => (
                            <span key={p}>
                              <span className={p === 1 ? 'p1' : 'p2'}>{name(p)}</span> {h.votes[p] ? VOTE_EMOJI[h.votes[p]!] : '—'}
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="faint" style={{ fontSize: 11, marginTop: 28, textAlign: 'center' }}>
                Data from TMDB · Streaming availability by JustWatch
              </p>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

function WhereToWatch({ availability, services }: { availability: import('../../shared/types').Availability | null; services: Set<number> }) {
  const { img, boot } = useApp();
  if (!availability) return null;
  const groups: { label: string; list: Provider[] }[] = [
    { label: 'Stream', list: [...availability.stream].sort((a, b) => Number(services.has(b.id)) - Number(services.has(a.id))) },
    { label: 'Free', list: availability.free },
    { label: 'Rent', list: availability.rent },
    { label: 'Buy', list: availability.buy },
  ].filter((g) => g.list.length);
  const ours = availability.stream.filter((p) => services.has(p.id));

  return (
    <>
      <div className="section-title">
        <span>Where to watch</span>
        <span style={{ textTransform: 'none', letterSpacing: 0 }}>{boot.settings.region}</span>
      </div>
      {ours.length > 0 && (
        <div className="ours-banner">
          <CheckCircle2 size={18} /> Included with {ours.map((p) => p.name).join(' & ')}
        </div>
      )}
      {groups.length === 0 ? (
        <p className="muted">Not available to stream, rent or buy in your region right now.</p>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="faint" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{g.label === 'Stream' ? 'Stream with subscription' : g.label === 'Free' ? 'Free / with ads' : g.label}</div>
              <div className="provider-row">
                {g.list.map((p) => (
                  <div key={p.id} className={`provider ${g.label === 'Stream' && services.has(p.id) ? 'mine' : ''}`} title={p.name}>
                    {p.logo ? <img src={img(p.logo, 'w92')!} alt="" /> : <span>{p.name[0]}</span>}
                    <span className="provider-name">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {availability.link && (
        <a href={availability.link} target="_blank" rel="noreferrer" className="btn sm ghost" style={{ marginTop: 12, paddingLeft: 0 }}>
          See all options <ExternalLink size={14} />
        </a>
      )}
    </>
  );
}
