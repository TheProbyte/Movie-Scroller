import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, type MotionValue } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Check, CheckCircle2, ExternalLink, Play, Popcorn, Star, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster, Starburst, formatRuntime } from './Poster';
import { sfx } from '../sound';
import { StarRating } from './StarRating';
import type { PlayerId, Provider, Title, Vote, WatchlistSection } from '../../shared/types';

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

/** Sections glide in one after another instead of popping into place. */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/**
 * Pull the whole sheet down to dismiss it. When the content is scrolled to the top (or you grab the
 * title bar) a downward drag moves the sheet; otherwise the content scrolls normally.
 */
function useSheetDrag(ref: React.RefObject<HTMLDivElement>, y: MotionValue, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let armed = false;
    let dragging = false;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      dragging = false;
      const fromBar = Boolean((e.target as Element | null)?.closest('.win-bar'));
      armed = fromBar || el.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (!dragging) {
        if (dy > 8 && dy > Math.abs(dx)) dragging = true;
        else if (dy < -4 || Math.abs(dx) > 10) armed = false; // scrolling up / sideways: let the browser handle it
        else return;
      }
      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - lastT);
      velocity = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      y.set(Math.max(0, dy - 8));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      armed = false;
      const pos = Number(y.get()) || 0;
      if (pos > 110 || velocity > 0.7) closeRef.current();
      else animate(y, 0, { type: 'spring', stiffness: 520, damping: 40 });
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, y]);
}

export function TitleSheet({ titleKey, sessionId }: { titleKey: string; sessionId: string | null }) {
  const { img, name, me, toast, boot } = useApp();
  const close = useCloseSheet();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Two requests: a tiny cached snapshot shows the header instantly, the full details fill in the rest.
  const snap = useQuery({ queryKey: ['snap', titleKey], queryFn: async () => (await api.titles([titleKey]))[titleKey], staleTime: Infinity });
  const q = useQuery({ queryKey: ['title', titleKey], queryFn: () => api.title(titleKey) });
  const [playing, setPlaying] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue('100%' as string | number);
  useSheetDrag(sheetRef, y, close);

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
  const t: Title | undefined = d ?? snap.data;
  const services = new Set(boot.settings.services);

  return (
    <>
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        ref={sheetRef}
        className="sheet detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t?.title ?? 'Title details'}
        style={{ y }}
        initial={{ y: '100%', x: '-50%' }}
        animate={{ y: 0, x: '-50%' }}
        exit={{ y: '100%', x: '-50%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      >
        <div className="win-bar">
          <span aria-hidden>📀</span>
          <span className="win-title">{t ? `${t.title} — Info` : 'Loading…'}</span>
          <button className="win-close" onClick={close} aria-label="Close">
            <X size={14} strokeWidth={3} />
          </button>
        </div>

        <div className="detail-hero">
          {t?.backdrop ? <img src={img(t.backdrop, 'w780')!} alt="" /> : <div className="detail-hero-fallback" />}
          <div className="detail-hero-fade" />
        </div>

        <div className="detail-body">
          <div className="row" style={{ alignItems: 'flex-end', gap: 16, marginTop: -110 }}>
            {t ? <Poster title={t} size="w342" className="detail-poster" eager band /> : <div className="poster dvd detail-poster skeleton" />}
            <div className="grow" style={{ paddingBottom: 4 }}>
              {t ? (
                <Reveal>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <span className={`type-pill ${t.type}`}>{t.type === 'tv' ? 'TV SERIES' : 'MOVIE'}</span>
                    {t.rating > 0 && (
                      <Starburst className="detail-burst">
                        ★<b>{t.rating.toFixed(1)}</b>
                      </Starburst>
                    )}
                  </div>
                  <h2 className="detail-title">{t.title}</h2>
                </Reveal>
              ) : (
                <div className="sk-lines"><span className="skeleton" style={{ width: '40%' }} /><span className="skeleton" style={{ width: '90%', height: 26 }} /></div>
              )}
            </div>
          </div>

          {t && (
            <Reveal delay={0.05}>
              <div className="detail-meta">
                {[t.year, formatRuntime(t), d?.certification ?? t.certification].filter(Boolean).map((x) => (
                  <span key={String(x)}>{x}</span>
                ))}
                {t.rating > 0 && (
                  <span className="row" style={{ gap: 4 }}>
                    <Star size={14} fill="var(--gold)" color="var(--gold)" /> {t.rating.toFixed(1)}
                    <span className="faint">({t.voteCount.toLocaleString()} votes)</span>
                  </span>
                )}
              </div>
              {t.genres.length > 0 && (
                <div className="chips" style={{ marginTop: 12 }}>
                  {t.genres.map((g) => (
                    <span key={g} className="tag">{g}</span>
                  ))}
                </div>
              )}
            </Reveal>
          )}

          {sessionId && t && (
            <button
              className="btn primary lg block"
              style={{ marginTop: 20 }}
              onClick={async () => {
                await api.choose(sessionId, t.key);
                sfx.land();
                qc.invalidateQueries({ queryKey: ['session', sessionId] });
                toast(`🍿 Tonight: ${t.title}`);
                close();
              }}
            >
              <Popcorn size={20} /> Watch this tonight
            </button>
          )}

          {t && (
            <div className={`detail-actions ${state ? '' : 'pending'}`}>
              {state?.watchlist ? (
                <button className="btn on-list" onClick={() => mutate.mutate(() => api.removeFromWatchlist(t.key))}>
                  <BookmarkCheck size={18} /> {SECTION_LABEL[state.watchlist.section]}
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={!state}
                  onClick={() =>
                    mutate.mutate(async () => {
                      await api.addToWatchlist([{ key: t.key, section: 'saved' }], { addedBy: me ?? undefined });
                      sfx.bling();
                      toast('Saved to your watchlist ★');
                    })
                  }
                >
                  <Bookmark size={18} /> Watchlist
                </button>
              )}
              {state?.watched ? (
                <button className="btn on-list" onClick={() => mutate.mutate(() => api.unmarkWatched(t.key))}>
                  <CheckCircle2 size={18} /> Watched
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={!state}
                  onClick={() =>
                    mutate.mutate(async () => {
                      await api.markWatched(t.key, sessionId ?? undefined);
                      sfx.bling();
                      toast('Marked as watched — rate it below');
                    })
                  }
                >
                  <Check size={18} /> Watched
                </button>
              )}
            </div>
          )}

          {state?.watched && (
            <Reveal>
              <div style={{ marginTop: 16 }} className="card">
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
                        mutate.mutate(() => api.rate(t!.key, p, v));
                      }}
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          {t && (
            <Reveal delay={0.1}>
              {d?.tagline && <p className="detail-tagline">“{d.tagline}”</p>}
              <p className="detail-overview">{t.overview || 'No synopsis available yet.'}</p>
            </Reveal>
          )}

          {/* Heavier extras arrive after the header; skeletons hold their place so nothing jumps. */}
          {!d ? (
            q.isError ? (
              <p className="muted" style={{ marginTop: 20 }}>{(q.error as Error).message}</p>
            ) : (
              <div className="sk-extras" aria-hidden>
                <div className="sk-title skeleton" />
                <div className="sk-trailer skeleton" />
                <div className="sk-row">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton" />)}</div>
              </div>
            )
          ) : (
            <>
              {d.trailer && (
                <Reveal delay={0.05}>
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
                </Reveal>
              )}

              <Reveal delay={0.12}>
                <WhereToWatch availability={d.availability} services={services} />
              </Reveal>

              {d.crew.length > 0 && (
                <Reveal delay={0.16}>
                  <p style={{ marginTop: 22 }} className="muted">
                    {d.crew[0].role === 'Director' ? 'Directed by ' : 'Created by '}
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.crew.map((c) => c.name).join(', ')}</span>
                  </p>
                </Reveal>
              )}

              {d.cast.length > 0 && (
                <Reveal delay={0.2}>
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
                </Reveal>
              )}

              {q.data!.history.length > 0 && (
                <Reveal delay={0.24}>
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
                </Reveal>
              )}

              <p className="faint" style={{ fontSize: 11, marginTop: 28, textAlign: 'center' }}>
                Data from TMDB · Streaming availability by JustWatch
              </p>
            </>
          )}
        </div>
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
