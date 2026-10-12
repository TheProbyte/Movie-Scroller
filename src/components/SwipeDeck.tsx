import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Heart, HelpCircle, Info, RotateCcw, X } from 'lucide-react';
import { useApp } from '../context';
import { DvdBand, Starburst, formatRuntime } from './Poster';
import { sfx } from '../sound';
import type { Title, Vote } from '../../shared/types';

const SWIPE_X = 100;
const SWIPE_Y = 110;
const THIS_YEAR = new Date().getFullYear();

const exitFor = (dir: Vote) =>
  dir === 'yes'
    ? { x: 520, rotate: 22, opacity: 0, transition: { duration: 0.32, ease: [0.25, 0.7, 0.3, 1] } }
    : dir === 'no'
      ? { x: -520, rotate: -22, opacity: 0, transition: { duration: 0.32, ease: [0.25, 0.7, 0.3, 1] } }
      : { y: -720, scale: 0.92, opacity: 0, transition: { duration: 0.36, ease: [0.25, 0.7, 0.3, 1] } };

/** Decode upcoming posters ahead of time so the next card never stalls the animation. */
function usePreload(urls: (string | null)[]) {
  const done = useRef(new Set<string>());
  useEffect(() => {
    for (const url of urls) {
      if (!url || done.current.has(url)) continue;
      done.current.add(url);
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
      im.decode?.().catch(() => {});
    }
  }, [urls]);
}

export function SwipeDeck({
  cards,
  onVote,
  onUndo,
  canUndo,
}: {
  cards: Title[];
  onVote: (t: Title, v: Vote) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { openTitle, img } = useApp();
  const [exitDir, setExitDir] = useState<Vote>('no');
  const top = cards[0];
  const next = cards[1];

  usePreload(cards.slice(0, 4).map((t) => img(t.poster, 'w780')));

  const commit = (v: Vote) => {
    if (!top) return;
    navigator.vibrate?.(v === 'yes' ? 14 : 8);
    sfx[v]();
    setExitDir(v);
    onVote(top, v);
  };

  // Arrow keys on desktop.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sheet, .dialog')) return;
      if (e.key === 'ArrowRight') commitRef.current('yes');
      else if (e.key === 'ArrowLeft') commitRef.current('no');
      else if (e.key === 'ArrowUp') commitRef.current('maybe');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stable callbacks so memoized cards don't re-render when the parent does.
  const openRef = useRef(openTitle);
  openRef.current = openTitle;
  const topRef = useRef(top);
  topRef.current = top;
  const commitStable = useCallback((v: Vote) => commitRef.current(v), []);
  const infoStable = useCallback(() => topRef.current && openRef.current(topRef.current.key), []);

  return (
    <div className="deck">
      <div className="deck-stack">
        <AnimatePresence custom={exitDir} initial={false}>
          {next && <SwipeCard key={next.key} title={next} depth={1} />}
          {top && <SwipeCard key={top.key} title={top} depth={0} onCommit={commitStable} onInfo={infoStable} />}
        </AnimatePresence>
      </div>

      <div className="deck-actions">
        <button
          className="orb orb-sm"
          onClick={() => {
            sfx.rewind();
            onUndo?.();
          }}
          disabled={!canUndo}
          aria-label="Undo last swipe"
        >
          <RotateCcw size={19} strokeWidth={2.6} />
        </button>
        <button className="orb orb-no" onClick={() => commit('no')} disabled={!top} aria-label="No">
          <X size={30} strokeWidth={3.4} />
        </button>
        <button className="orb orb-maybe" onClick={() => commit('maybe')} disabled={!top} aria-label="Maybe">
          <HelpCircle size={26} strokeWidth={2.8} />
        </button>
        <button className="orb orb-yes" onClick={() => commit('yes')} disabled={!top} aria-label="Yes">
          <Heart size={28} strokeWidth={2.6} fill="currentColor" />
        </button>
        <button className="orb orb-sm" onClick={() => top && openTitle(top.key)} disabled={!top} aria-label="Details">
          <Info size={19} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

const SwipeCard = memo(function SwipeCard({ title, depth, onCommit, onInfo }: { title: Title; depth: number; onCommit?: (v: Vote) => void; onInfo?: () => void }) {
  const { img, boot } = useApp();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-14, 0, 14]);
  const yesO = useTransform(x, [20, SWIPE_X], [0, 1]);
  const noO = useTransform(x, [-SWIPE_X, -20], [1, 0]);
  const maybeO = useTransform(y, [-SWIPE_Y, -26], [1, 0]);
  const dragged = useRef(false);

  const services = new Set(boot.settings.services);
  const ours = title.availability?.stream.filter((p) => services.has(p.id)) ?? [];
  const stream = ours[0] ?? title.availability?.stream[0];
  const meta = [title.year, formatRuntime(title), title.certification].filter(Boolean).join('  •  ');
  const isNew = title.year != null && title.year >= THIS_YEAR - 1;

  return (
    <motion.div
      className="swipe-card"
      style={{ x, y, rotate, zIndex: depth ? 1 : 2 }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: depth ? 0.94 : 1, opacity: 1, y: depth ? 14 : 0 }}
      exit={exitFor as never}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      drag={depth === 0}
      dragMomentum={false}
      onPointerDown={() => (dragged.current = false)}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={(_, info) => {
        const vx = info.velocity.x;
        const dx = info.offset.x;
        const dy = info.offset.y;
        if (dx > SWIPE_X || (vx > 600 && dx > 30)) return onCommit?.('yes');
        if (dx < -SWIPE_X || (vx < -600 && dx < -30)) return onCommit?.('no');
        if (dy < -SWIPE_Y && Math.abs(dx) < SWIPE_X) return onCommit?.('maybe');
        animate(x, 0, { type: 'spring', stiffness: 600, damping: 34 });
        animate(y, 0, { type: 'spring', stiffness: 600, damping: 34 });
      }}
      onTap={() => {
        if (!dragged.current) onInfo?.();
      }}
    >
      <div className="dvd dvd-big">
        <div className="dvd-art">
          {title.poster ? <img src={img(title.poster, 'w780')!} alt={title.title} draggable={false} /> : <div className="fallback">{title.title}</div>}
          <DvdBand title={title} />
          {title.rating > 0 && (
            <Starburst className="card-burst">
              ★<b>{title.rating.toFixed(1)}</b>
            </Starburst>
          )}
          {isNew && <span className="sticker sticker-new">NEW RELEASE</span>}
          {stream && <span className={`sticker sticker-stream ${ours.length ? 'ours' : ''}`}>{ours.length ? `✓ On ${stream.name}` : stream.name}</span>}
        </div>
        {depth === 0 && (
          <>
            <motion.div className="stamp stamp-yes" style={{ opacity: yesO }}>Yes!</motion.div>
            <motion.div className="stamp stamp-no" style={{ opacity: noO }}>Nope</motion.div>
            <motion.div className="stamp stamp-maybe" style={{ opacity: maybeO }}>Maybe</motion.div>
          </>
        )}
      </div>
      <div className="shelf-label">
        <div className="shelf-title">{title.title}</div>
        <div className="shelf-meta">
          <span className={`type-pill ${title.type}`}>{title.type === 'tv' ? 'TV' : 'MOVIE'}</span>
          {meta}
        </div>
        {title.genres.length > 0 && <div className="shelf-genres">{title.genres.slice(0, 3).join(' · ')}</div>}
      </div>
    </motion.div>
  );
});
