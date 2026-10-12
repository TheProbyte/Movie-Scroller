import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Info, Popcorn, X } from 'lucide-react';
import { useApp } from '../context';
import { Poster, formatRuntime } from './Poster';
import { Confetti } from './Fx';
import { sfx } from '../sound';
import type { Title } from '../../shared/types';

/**
 * Movie Roulette: rapidly flicks through posters, slows down like a wheel,
 * and lands on tonight's pick. Rerolls avoid repeating the last pick.
 */
export function Roulette({ titles, onClose, onPick }: { titles: Title[]; onClose: () => void; onPick?: (t: Title) => void }) {
  const { openTitle } = useApp();
  const [current, setCurrent] = useState<Title>(titles[0]);
  const [spinning, setSpinning] = useState(true);
  const [round, setRound] = useState(0);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!titles.length) return;
    const pool = titles.length > 1 ? titles.filter((t) => t.key !== last.current) : titles;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    setSpinning(true);
    let cancelled = false;
    let i = Math.floor(Math.random() * titles.length);
    let delay = 55;
    const steps: number[] = [];
    // Ease out: ~2.8s total, accelerating gaps between flips.
    while (delay < 420) {
      steps.push(delay);
      delay *= 1.12;
    }
    let s = 0;
    const tick = () => {
      if (cancelled) return;
      if (s >= steps.length) {
        setCurrent(winner);
        setSpinning(false);
        last.current = winner.key;
        sfx.land();
        navigator.vibrate?.([12, 40, 20]);
        return;
      }
      i = (i + 1) % titles.length;
      if (titles.length > 1 && s === steps.length - 1 && titles[i].key === winner.key) i = (i + 1) % titles.length;
      setCurrent(titles[i]);
      sfx.tick();
      navigator.vibrate?.(4);
      window.setTimeout(tick, steps[s++]);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [round, titles]);

  return (
    <motion.div className="roulette" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="roulette-glow" style={{ opacity: spinning ? 0.35 : 0.9 }} />
      <button className="icon-btn" style={{ position: 'absolute', top: 'calc(var(--safe-top) + 16px)', right: 18 }} onClick={onClose} aria-label="Close roulette">
        <X size={20} />
      </button>

      <div className="roulette-label">{spinning ? '★ Spinning… ★' : '★ Tonight you’re watching ★'}</div>

      {!spinning && <Confetti key={current.key} count={30} />}
      <div className="roulette-stage">
        <span className="roulette-lights" aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={current.key + String(spinning)}
            initial={spinning ? { y: 60, opacity: 0.4, scale: 0.92 } : { scale: 0.9 }}
            animate={spinning ? { y: 0, opacity: 1, scale: 0.96 } : { scale: 1, y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.92 }}
            transition={spinning ? { duration: 0.08 } : { type: 'spring', stiffness: 260, damping: 14 }}
            className={`roulette-card ${spinning ? '' : 'landed'}`}
          >
            <Poster title={current} size="w500" eager band />
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ minHeight: 120, textAlign: 'center', padding: '0 24px' }}>
        <AnimatePresence>
          {!spinning && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="detail-title" style={{ fontSize: 28 }}>{current.title}</h2>
              <p className="muted" style={{ marginTop: 6 }}>{[current.year, formatRuntime(current), current.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="roulette-actions">
        <button className="btn lg" disabled={spinning} onClick={() => setRound((r) => r + 1)}>
          <Dices size={20} /> Spin again
        </button>
        {onPick ? (
          <button className="btn primary lg" disabled={spinning} onClick={() => onPick(current)}>
            <Popcorn size={20} /> Let’s watch it
          </button>
        ) : (
          <button className="btn primary lg" disabled={spinning} onClick={() => openTitle(current.key)}>
            <Info size={20} /> Details
          </button>
        )}
      </div>
    </motion.div>
  );
}
