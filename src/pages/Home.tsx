import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Bookmark, CheckCircle2, Clock3, KeyRound, Search, Settings as Gear, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster } from '../components/Poster';
import { otherPlayer } from '../../shared/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const { boot, name, img, me, openTitle } = useApp();
  const navigate = useNavigate();
  const rails = useQuery({ queryKey: ['rails'], queryFn: api.rails, staleTime: 10 * 60_000 });
  const active = useQuery({ queryKey: ['active'], queryFn: api.activeSessions });
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const watched = useQuery({ queryKey: ['watched'], queryFn: api.watched });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions });
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats });

  const hero = rails.data?.trending.find((t) => t.backdrop) ?? rails.data?.forYou.find((t) => t.backdrop);
  const live = active.data?.[0];
  const watchedKeys = new Set(watched.data?.entries.map((e) => e.key));
  const lastPick = sessions.data?.find((s) => s.chosenKey);
  const pendingPick = lastPick && !watchedKeys.has(lastPick.chosenKey!) ? lastPick : null;
  const wlPosters = watchlist.data?.entries.slice(0, 3).map((e) => watchlist.data!.titles[e.key]) ?? [];
  const wPosters = watched.data?.entries.slice(0, 3).map((e) => watched.data!.titles[e.key]) ?? [];
  const pickQ = useQuery({
    queryKey: ['titles', pendingPick?.chosenKey],
    queryFn: () => api.titles([pendingPick!.chosenKey!]),
    enabled: Boolean(pendingPick),
    staleTime: Infinity,
  });
  const pickTitle = pendingPick ? pickQ.data?.[pendingPick.chosenKey!] : undefined;

  return (
    <div className="page home">
      {hero?.backdrop && (
        <div className="home-hero" aria-hidden>
          <img src={img(hero.backdrop, 'w1280')!} alt="" />
          <div className="home-hero-fade" />
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{greeting()}</div>
          <div className="display" style={{ fontSize: 22 }}>
            {name(1)} <span style={{ color: 'var(--accent)' }}>&</span> {name(2)}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/discover?focus=1" className="icon-btn glass" aria-label="Search">
            <Search size={19} />
          </Link>
          <Link to="/settings" className="icon-btn glass" aria-label="Settings">
            <Gear size={19} />
          </Link>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="home-intro">
        <h1 className="display home-title">
          What are we
          <br />
          watching tonight?
        </h1>
      </motion.div>

      {live && (
        <motion.button
          className="live-card glass"
          onClick={() => navigate(`/night/${live.id}`)}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <span className="live-dot" />
          <div className="grow" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>
              Movie night in progress {live.mode === 'duo' && <span className="faint">· {live.code}</span>}
            </div>
            <div className="faint" style={{ fontSize: 13 }}>
              {name(1)} {live.progress[1].done}/{live.progress[1].total} · {name(2)} {live.progress[2].done}/{live.progress[2].total}
            </div>
          </div>
          <span className="btn sm primary">
            {live.mode === 'duo' && me && live.progress[me].done === 0 && live.createdBy === otherPlayer(me) ? 'Join' : 'Continue'}
          </span>
        </motion.button>
      )}

      <motion.button
        className="start-card"
        onClick={() => navigate('/night/new')}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="start-card-posters" aria-hidden>
          {(rails.data?.trending ?? []).slice(1, 4).map((t, i) => (
            <div key={t.key} className="start-card-poster" style={{ transform: `rotate(${(i - 1) * 8}deg) translateX(${(i - 1) * 46}px) translateY(${Math.abs(i - 1) * 8}px)`, zIndex: i === 1 ? 2 : 1 }}>
              <Poster title={t} size="w185" eager />
            </div>
          ))}
        </div>
        <div className="start-card-text">
          <div className="display" style={{ fontSize: 32, lineHeight: 1 }}>Start Movie Night</div>
          <p className="muted" style={{ marginTop: 6 }}>Swipe, match, and find something you both love.</p>
          <span className="start-card-cta">
            Let’s go <ArrowRight size={18} />
          </span>
        </div>
      </motion.button>

      <Link to="/night/join" className="join-link">
        <KeyRound size={16} /> Join with a code
      </Link>

      {pendingPick && pickTitle && (
        <button className="card row" style={{ marginTop: 18, width: '100%', textAlign: 'left' }} onClick={() => openTitle(pickTitle.key)}>
          <Poster title={pickTitle} size="w185" className="mini-poster" />
          <div className="grow">
            <div className="eyebrow" style={{ margin: 0 }}>Your last pick</div>
            <div style={{ fontWeight: 600 }}>{pickTitle.title}</div>
            <div className="faint" style={{ fontSize: 13 }}>Watched it? Mark it and rate it.</div>
          </div>
          <CheckCircle2 size={22} className="faint" />
        </button>
      )}

      <div className="home-grid">
        <HomeTile to="/watchlist" icon={<Bookmark size={18} />} label="Our Watchlist" value={watchlist.data ? `${watchlist.data.entries.length} saved` : '…'} posters={wlPosters} />
        <HomeTile to="/watched" icon={<CheckCircle2 size={18} />} label="Already Watched" value={watched.data ? `${watched.data.entries.length} titles` : '…'} posters={wPosters} />
        <HomeTile
          to="/history"
          icon={<Clock3 size={18} />}
          label="Movie Night History"
          value={sessions.data ? `${sessions.data.length} night${sessions.data.length === 1 ? '' : 's'}` : '…'}
          posters={sessions.data?.[0]?.posterPreview.slice(0, 3).map((p, i) => ({ poster: p, title: String(i) })) ?? []}
        />
        <Link to="/taste" className="home-tile taste-tile">
          <div className="row" style={{ gap: 8 }}>
            <Sparkles size={18} />
            <span>Our Taste</span>
          </div>
          <div className="taste-big display">{stats.data && stats.data.sharedVotes > 0 ? `${Math.round(stats.data.agreement * 100)}%` : '—'}</div>
          <div className="faint" style={{ fontSize: 12 }}>{stats.data && stats.data.sharedVotes > 0 ? 'in sync' : 'Swipe together to unlock'}</div>
        </Link>
      </div>

      {(rails.data?.forYou.length ?? 0) > 0 && (
        <>
          <div className="section-title">
            <span>Picked for you two</span>
            <Link to="/discover" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--accent)' }}>See more</Link>
          </div>
          <div className="rail">
            {rails.data!.forYou.slice(0, 10).map((t) => (
              <button key={t.key} onClick={() => openTitle(t.key)} style={{ textAlign: 'left' }}>
                <Poster title={t} size="w185" />
                <div className="tile-title">{t.title}</div>
              </button>
            ))}
          </div>
        </>
      )}
      {!boot.tmdbConfigured && <p className="muted">TMDB isn’t configured yet — open Settings to add your key.</p>}
    </div>
  );
}

function HomeTile({ to, icon, label, value, posters }: { to: string; icon: React.ReactNode; label: string; value: string; posters: ({ poster: string | null; title: string } | undefined)[] }) {
  return (
    <Link to={to} className="home-tile">
      <div className="home-tile-posters" aria-hidden>
        {posters.filter(Boolean).slice(0, 3).map((p, i) => (
          <div key={i} style={{ transform: `rotate(${(i - 1) * 7}deg) translateX(${(i - 1) * 18}px)`, zIndex: i === 1 ? 2 : 1 }}>
            <Poster title={p as { poster: string | null; title: string }} size="w185" />
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{value}</div>
    </Link>
  );
}
