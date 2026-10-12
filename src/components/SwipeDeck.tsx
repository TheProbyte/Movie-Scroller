import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Heart, HelpCircle, Info, RotateCcw, Star, X } from 'lucide-react';
import { useApp } from '../context';
import { formatRuntime } from './Poster';
import type { Title, Vote } from '../../shared/types';

const SWIPE_X = 110;
const SWIPE_Y = 120;

const exitFor = (dir: Vote) =>
  dir === 'yes'
    ? { x: 560, rotate: 24, opacity: 0, transition: { duration: 0.38, ease: [0.2, 0.7, 0.3, 1] } }
    : dir === 'no'
      ? { x: -560, rotate: -24, opacity: 0, transition: { duration: 0.38, ease: [0.2, 0.7, 0.3, 1] } }
      : { y: -760, scale: 0.9, opacity: 0, transition: { duration: 0.42, ease: [0.2, 0.7, 0.3, 1] } };

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

  const commit = (v: Vote) => {
    if (!top) return;
    navigator.vibrate?.(v === 'yes' ? 14 : 8);
    setExitDir(v);
    onVote(top, v);
  };

  // Preload upcoming posters so cards never pop in.
  useEffect(() => {
    for (const t of cards.slice(1, 4)) {
      const src = img(t.poster, 'w780');
      if (src) new Image().src = src;
    }
  }, [cards, img]);

  // Arrow keys on desktop.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sheet')) return;
      if (e.key === 'ArrowRight') commitRef.current('yes');
      else if (e.key === 'ArrowLeft') commitRef.current('no');
      else if (e.key === 'ArrowUp') commitRef.current('maybe');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="deck">
      <div className="deck-stack">
        <AnimatePresence custom={exitDir} initial={false}>
          {next && <SwipeCard key={next.key} title={next} depth={1} />}
          {top && <SwipeCard key={top.key} title={top} depth={0} onCommit={commit} onInfo={() => openTitle(top.key)} />}
        </AnimatePresence>
      </div>

      <div className="deck-actions">
        <button className="act act-sm" onClick={onUndo} disabled={!canUndo} aria-label="Undo last swipe">
          <RotateCcw size={20} />
        </button>
        <button className="act act-no" onClick={() => commit('no')} disabled={!top} aria-label="No">
          <X size={32} strokeWidth={2.6} />
        </button>
        <button className="act act-maybe" onClick={() => commit('maybe')} disabled={!top} aria-label="Maybe">
          <HelpCircle size={26} strokeWidth={2.3} />
        </button>
        <button className="act act-yes" onClick={() => commit('yes')} disabled={!top} aria-label="Yes">
          <Heart size={30} strokeWidth={2.4} fill="currentColor" />
        </button>
        <button className="act act-sm" onClick={() => top && openTitle(top.key)} disabled={!top} aria-label="Details">
          <Info size={20} />
        </button>
      </div>
    </div>
  );
}

function SwipeCard({ title, depth, onCommit, onInfo }: { title: Title; depth: number; onCommit?: (v: Vote) => void; onInfo?: () => void }) {
  const { img, boot } = useApp();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);
  const yesO = useTransform(x, [24, SWIPE_X], [0, 1]);
  const noO = useTransform(x, [-SWIPE_X, -24], [1, 0]);
  const maybeO = useTransform(y, [-SWIPE_Y, -30], [1, 0]);
  const dragged = useRef(false);

  const services = new Set(boot.settings.services);
  const ours = title.availability?.stream.filter((p) => services.has(p.id)) ?? [];
  const streamLogo = ours[0] ?? title.availability?.stream[0];
  const meta = [title.year, formatRuntime(title), title.certification].filter(Boolean).join('  ·  ');

  return (
    <motion.div
      className="swipe-card"
      style={{ x, y, rotate, zIndex: depth ? 1 : 2 }}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: depth ? 0.94 : 1, opacity: 1, y: depth ? 18 : 0 }}
      exit={exitFor as never}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      drag={depth === 0}
      dragMomentum={false}
      onPointerDown={() => (dragged.current = false)}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={(_, info) => {
        const vx = info.velocity.x;
        const dx = info.offset.x;
        const dy = info.offset.y;
        if (dx > SWIPE_X || (vx > 650 && dx > 30)) return onCommit?.('yes');
        if (dx < -SWIPE_X || (vx < -650 && dx < -30)) return onCommit?.('no');
        if (dy < -SWIPE_Y && Math.abs(dx) < SWIPE_X) return onCommit?.('maybe');
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
        animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 });
      }}
      onTap={() => {
        if (!dragged.current) onInfo?.();
      }}
      whileTap={depth === 0 ? { scale: 0.985 } : undefined}
    >
      <div className="swipe-card-inner">
        {title.poster ? <img src={img(title.poster, 'w780')!} alt={title.title} draggable={false} /> : <div className="poster-fallback display">{title.title}</div>}
        <div className="swipe-fade" />

        {depth === 0 && (
          <>
            <motion.div className="stamp stamp-yes" style={{ opacity: yesO }}>Yes!</motion.div>
            <motion.div className="stamp stamp-no" style={{ opacity: noO }}>Nope</motion.div>
            <motion.div className="stamp stamp-maybe" style={{ opacity: maybeO }}>Maybe</motion.div>
          </>
        )}

        {streamLogo && (
          <div className={`stream-badge glass ${ours.length ? 'ours' : ''}`}>
            {streamLogo.logo && <img src={img(streamLogo.logo, 'w92')!} alt="" />}
            <span>{ours.length ? 'On ' + streamLogo.name : streamLogo.name}</span>
          </div>
        )}

        <div className="swipe-info">
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <span className="tag glass-tag">{title.type === 'tv' ? 'Series' : 'Movie'}</span>
            {title.rating > 0 && (
              <span className="tag glass-tag">
                <Star size={12} fill="var(--accent)" color="var(--accent)" /> {title.rating.toFixed(1)}
              </span>
            )}
          </div>
          <h2 className="display swipe-title">{title.title}</h2>
          <div className="swipe-meta">{meta}</div>
          {title.genres.length > 0 && <div className="swipe-genres">{title.genres.slice(0, 3).join(' · ')}</div>}
        </div>
      </div>
    </motion.div>
  );
}
