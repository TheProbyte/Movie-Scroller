import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, KeyRound, Search, Settings as Gear, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { Poster } from '../components/Poster';
import { sfx } from '../sound';
import { otherPlayer } from '../../shared/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late? Perfect.';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const { boot, name, me, openTitle, ask, toast } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rails = useQuery({ queryKey: ['rails'], queryFn: api.rails, staleTime: 10 * 60_000 });
  const active = useQuery({ queryKey: ['active'], queryFn: api.activeSessions });
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const watched = useQuery({ queryKey: ['watched'], queryFn: api.watched });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions });
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats });

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
  const nights = sessions.data?.filter((s) => s.status === 'complete').length ?? 0;
  const marquee = (rails.data?.trending ?? []).slice(0, 10).map((t) => t.title);

  const cancelLive = async () => {
    if (!live) return;
    const v = await ask({
      title: 'Cancel movie night',
      icon: '⚠️',
      message: 'Cancel the movie night in progress? Everyone’s swipes for it will be removed.',
      buttons: [
        { label: 'Yes, cancel it', value: 'yes', variant: 'danger' },
        { label: 'Keep it', value: 'no' },
      ],
    });
    if (v !== 'yes') return;
    await api.deleteSession(live.id).catch((e: Error) => toast(e.message));
    sfx.cancel();
    qc.invalidateQueries({ queryKey: ['active'] });
    qc.invalidateQueries({ queryKey: ['sessions'] });
    toast('Movie night cancelled');
  };

  return (
    <div className="page home">
      <div className="page-header">
        <div className="logo">
          <span className="logo-disc" aria-hidden />
          <div>
            <div className="logo-text chrome">MovieMatch</div>
            <div className="logo-sub">
              ★ {name(1)} &amp; {name(2)}’s video club ★
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/discover?focus=1" className="icon-btn" aria-label="Search">
            <Search size={19} strokeWidth={2.6} />
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <Gear size={19} strokeWidth={2.6} />
          </Link>
        </div>
      </div>

      <div className="marquee" aria-label="Now showing">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <span key={copy} aria-hidden={copy === 1}>
              ★ {greeting().toUpperCase()} ★ NOW SHOWING: {marquee.length ? marquee.join(' ✦ ') : 'GRAB THE POPCORN'} ★ BE KIND, REWIND ★
            </span>
          ))}
        </div>
      </div>

      {live && (
        <motion.div className="live-card card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <span className="live-dot" />
          <button className="grow" style={{ textAlign: 'left' }} onClick={() => navigate(`/night/${live.id}`)}>
            <div style={{ fontWeight: 900 }}>
              Movie night in progress {live.mode === 'duo' && <span className="led">{live.code}</span>}
            </div>
            <div className="faint" style={{ fontSize: 13 }}>
              {name(1)} {live.progress[1].done}/{live.progress[1].total} · {name(2)} {live.progress[2].done}/{live.progress[2].total}
            </div>
          </button>
          <button className="btn sm primary" onClick={() => navigate(`/night/${live.id}`)}>
            {live.mode === 'duo' && me && live.progress[me].done === 0 && live.createdBy === otherPlayer(me) ? 'Join' : 'Continue'}
          </button>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={cancelLive} aria-label="Cancel movie night">
            <X size={16} strokeWidth={3} />
          </button>
        </motion.div>
      )}

      <motion.button
        className="start-card"
        onClick={() => {
          sfx.pop();
          navigate('/night/new');
        }}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="start-card-posters" aria-hidden>
          {(rails.data?.trending ?? []).slice(1, 4).map((t, i) => (
            <motion.div
              key={t.key}
              className="start-card-poster"
              initial={{ rotate: 0, x: 0, y: 30, opacity: 0 }}
              animate={{ rotate: (i - 1) * 12, x: (i - 1) * 62, y: Math.abs(i - 1) * 10, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 220, damping: 16 }}
              style={{ zIndex: i === 1 ? 2 : 1 }}
            >
              <Poster title={t} size="w185" eager />
            </motion.div>
          ))}
        </div>
        <div className="start-card-title chrome">Start Movie Night</div>
        <p className="muted" style={{ marginTop: 6 }}>Swipe, match, and find something you’ll both love.</p>
        <span className="btn primary lg start-card-cta">▶ PLAY</span>
      </motion.button>

      <Link to="/night/join" className="join-link">
        <KeyRound size={16} /> Got a code? Join a movie night
      </Link>

      {pendingPick && pickTitle && (
        <button className="card row" style={{ marginTop: 18, width: '100%', textAlign: 'left' }} onClick={() => openTitle(pickTitle.key)}>
          <Poster title={pickTitle} size="w185" className="mini-poster" />
          <div className="grow">
            <div className="eyebrow" style={{ margin: 0 }}>Your last pick</div>
            <div style={{ fontWeight: 900 }}>{pickTitle.title}</div>
            <div className="faint" style={{ fontSize: 13 }}>Watched it? Mark it and rate it.</div>
          </div>
          <CheckCircle2 size={22} className="faint" />
        </button>
      )}

      <div className="home-grid">
        <HomeTile to="/watchlist" icon="📼" label="Our Watchlist" value={watchlist.data ? `${watchlist.data.entries.length} saved` : '…'} posters={wlPosters} />
        <HomeTile to="/watched" icon="🍿" label="Already Watched" value={watched.data ? `${watched.data.entries.length} titles` : '…'} posters={wPosters} />
        <HomeTile
          to="/history"
          icon="🗓️"
          label="Movie Night History"
          value={sessions.data ? `${sessions.data.length} night${sessions.data.length === 1 ? '' : 's'}` : '…'}
          posters={sessions.data?.[0]?.posterPreview.slice(0, 3).map((p, i) => ({ poster: p, title: String(i) })) ?? []}
        />
        <Link to="/taste" className="home-tile">
          <span className="home-tile-icon">💞</span>
          <span className="taste-big">{stats.data && stats.data.sharedVotes > 0 ? `${Math.round(stats.data.agreement * 100)}%` : '--'}</span>
          <span>Our Taste</span>
          <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>{stats.data && stats.data.sharedVotes > 0 ? 'in sync' : 'Swipe together to unlock'}</span>
        </Link>
      </div>

      {(rails.data?.forYou.length ?? 0) > 0 && (
        <>
          <div className="section-title">
            <span>Staff picks for you two</span>
            <Link to="/discover" style={{ textTransform: 'none', letterSpacing: 0 }}>
              See more
            </Link>
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

      <footer className="home-footer">
        <div>movie nights so far</div>
        <div className="hit-counter" aria-label={`${nights} movie nights`}>
          {String(nights).padStart(6, '0').split('').map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="badges88" aria-hidden>
          <span className="badge88" style={{ background: 'linear-gradient(#ffe066,#ff9d1c)', color: '#3a1600' }}>BEST VIEWED<br />WITH POPCORN</span>
          <span className="badge88" style={{ background: 'linear-gradient(#7fd6ff,#0b74e6)', color: '#fff' }}>2 PLAYER<br />MODE ★</span>
          <span className="badge88" style={{ background: 'linear-gradient(#ff9fd6,#c2187a)', color: '#fff' }}>MADE WITH<br />♥ FOR US</span>
        </div>
      </footer>
    </div>
  );
}

function HomeTile({ to, icon, label, value, posters }: { to: string; icon: string; label: string; value: string; posters: ({ poster: string | null; title: string } | undefined)[] }) {
  return (
    <Link to={to} className="home-tile">
      <span className="home-tile-icon">{icon}</span>
      <div className="home-tile-posters" aria-hidden>
        {posters.filter(Boolean).slice(0, 3).map((p, i) => (
          <div key={i} style={{ transform: `rotate(${(i - 1) * 9}deg) translateX(${(i - 1) * 10}px)`, zIndex: i === 1 ? 2 : 1 }}>
            <Poster title={p as { poster: string | null; title: string }} size="w185" />
          </div>
        ))}
      </div>
      <span>{label}</span>
      <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
    </Link>
  );
}
