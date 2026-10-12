import { useEffect, useMemo, useRef } from 'react';
import { sfx, unlockAudio } from '../sound';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Tap anywhere for a little burst of sparkles (skipped while swiping so cards stay smooth). */
export function TapSparkles() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const target = e.target as HTMLElement | null;
      if (target?.closest('.btn, .chip, .segmented button, .tabbar a, .mode-card, .switch-row')) sfx.click();
      if (reduced() || target?.closest('.swipe-screen, input, textarea, select')) return;
      const layer = document.createElement('div');
      layer.className = 'sparkle-layer';
      layer.style.left = `${e.clientX}px`;
      layer.style.top = `${e.clientY}px`;
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
    return () => window.removeEventListener('pointerdown', onDown);
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
