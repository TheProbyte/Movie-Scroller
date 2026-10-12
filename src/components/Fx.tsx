import { useEffect, useMemo, useRef } from 'react';
import { sfx, unlockAudio } from '../sound';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Tap anywhere for a little burst of sparkles (skipped while swiping so cards stay smooth). */
export function TapSparkles() {
  useEffect(() => {
    // A "tap" is a quick press that barely moves. Scrolling or dragging fires pointercancel / big
    // movement, so it never sparkles.
    let start: { x: number; y: number; t: number; target: HTMLElement | null } | null = null;
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      start = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target as HTMLElement | null };
    };
    const onCancel = () => {
      start = null;
    };
    const onUp = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || performance.now() - s.t > 450 || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) return;
      const target = s.target;
      if (target?.closest('.btn, .chip, .segmented button, .tabbar a, .mode-card, .switch-row')) sfx.click();
      if (reduced() || target?.closest('.swipe-screen, input, textarea, select')) return;
      const layer = document.createElement('div');
      layer.className = 'sparkle-layer';
      layer.style.left = `${s.x}px`;
      layer.style.top = `${s.y}px`;
      const glyphs = ['✦', '★', '✧', '♥', '✦', '★'];
      glyphs.forEach((g, i) => {
        const s = document.createElement('span');
        const angle = (i / glyphs.length) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 26 + Math.random() * 22;
        s.textContent = g;
        s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
        s.style.setProperty('--hue', String(Math.floor(Math.random() * 360)));
        layer.appendChild(s);
      });
      document.body.appendChild(layer);
      window.setTimeout(() => layer.remove(), 650);
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);
  return null;
}

/** Falling popcorn, stars and hearts. Mount it to celebrate; it cleans itself up. */
export function Confetti({ count = 46 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: reduced() ? 0 : count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.8 + Math.random() * 1.4,
        rot: Math.random() * 720 - 360,
        drift: Math.random() * 80 - 40,
        glyph: ['🍿', '★', '♥', '✦', '🎬', '★'][i % 6],
        hue: Math.floor(Math.random() * 360),
        size: 14 + Math.random() * 14,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={
            {
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              fontSize: p.size,
              color: `hsl(${p.hue} 95% 70%)`,
              '--rot': `${p.rot}deg`,
              '--drift': `${p.drift}px`,
            } as React.CSSProperties
          }
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}

/** The classic bouncing DVD logo, for the waiting screen. */
export function BouncingDisc() {
  const box = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced()) return;
    let x = 20;
    let y = 20;
    let vx = 1.4;
    let vy = 1.1;
    let hue = 200;
    let raf = 0;
    const step = () => {
      const b = box.current;
      const l = logo.current;
      if (b && l) {
        const maxX = b.clientWidth - l.offsetWidth;
        const maxY = b.clientHeight - l.offsetHeight;
        x += vx;
        y += vy;
        let hit = false;
        if (x <= 0 || x >= maxX) {
          vx = -vx;
          x = Math.max(0, Math.min(maxX, x));
          hit = true;
        }
        if (y <= 0 || y >= maxY) {
          vy = -vy;
          y = Math.max(0, Math.min(maxY, y));
          hit = true;
        }
        if (hit) {
          hue = (hue + 67) % 360;
          l.style.setProperty('--hue', String(hue));
        }
        l.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="bounce-box" ref={box} aria-hidden>
      <div className="bounce-logo" ref={logo}>
        <span className="bounce-disc" />
        <span>MOVIE</span>
        <span>MATCH</span>
      </div>
    </div>
  );
}

/** Slow-floating glossy bubbles behind everything (Frutiger Aero). Transform/opacity only, so it stays cheap. */
export function Bubbles() {
  const bubbles = useMemo(
    () =>
      [
        { l: 6, s: 70, d: 26, dl: 0 },
        { l: 22, s: 34, d: 19, dl: 6 },
        { l: 41, s: 96, d: 34, dl: 12 },
        { l: 58, s: 26, d: 17, dl: 3 },
        { l: 72, s: 58, d: 28, dl: 9 },
        { l: 88, s: 40, d: 22, dl: 15 },
        { l: 33, s: 22, d: 15, dl: 20 },
      ].map((b, i) => ({ ...b, i })),
    [],
  );
  return (
    <div className="bubbles" aria-hidden>
      {bubbles.map((b) => (
        <span key={b.i} style={{ left: `${b.l}%`, width: b.s, height: b.s, animationDuration: `${b.d}s`, animationDelay: `-${b.dl}s` }} />
      ))}
    </div>
  );
}
