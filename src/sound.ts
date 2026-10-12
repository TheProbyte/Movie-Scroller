// Tiny synthesized sound effects (Web Audio, no files). Muting is remembered per device.
import { useSyncExternalStore } from 'react';

const MUTE_KEY = 'mm.muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const isMuted = () => muted;
export function useMuted(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
  );
  return [v, setMuted];
}

/** Browsers only allow audio after a user gesture; call this from one. */
export function unlockAudio() {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio support */
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(t: Tone) {
  const a = ac();
  if (!a) return;
  const start = a.currentTime + (t.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = t.type ?? 'sine';
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  const peak = (t.gain ?? 0.18) * 0.6;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  osc.connect(g).connect(a.destination);
  osc.start(start);
  osc.stop(start + t.dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, from: number, to: number, gain = 0.12, delay = 0) {
  const a = ac();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const start = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, start);
  f.frequency.exponentialRampToValueAtTime(to, start + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(start);
  src.stop(start + dur + 0.02);
}

const notes = (freqs: number[], step: number, type: OscillatorType = 'triangle', gain = 0.16, dur = 0.22) =>
  freqs.forEach((freq, i) => tone({ freq, dur, type, gain, delay: i * step }));

export const sfx = {
  click: () => tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.035 }),
  pop: () => tone({ freq: 520, to: 980, dur: 0.09, type: 'sine', gain: 0.12 }),
  whoosh: () => noise(0.28, 500, 3200, 0.1),
  yes: () => {
    noise(0.22, 600, 3000, 0.07);
    notes([784, 1175], 0.07, 'triangle', 0.17, 0.2);
  },
  no: () => {
    noise(0.22, 2400, 400, 0.07);
    tone({ freq: 300, to: 150, dur: 0.22, type: 'sawtooth', gain: 0.06 });
  },
  maybe: () => {
    noise(0.2, 800, 2000, 0.06);
    tone({ freq: 440, to: 660, dur: 0.12, type: 'sine', gain: 0.14 });
    tone({ freq: 660, to: 520, dur: 0.14, type: 'sine', gain: 0.12, delay: 0.1 });
  },
  rewind: () => tone({ freq: 1400, to: 300, dur: 0.25, type: 'square', gain: 0.05 }),
  tick: () => tone({ freq: 2400, dur: 0.018, type: 'square', gain: 0.05 }),
  land: () => notes([523, 659, 784, 1047], 0.08, 'triangle', 0.17, 0.35),
  fanfare: () => {
    notes([523, 659, 784], 0.11, 'square', 0.07, 0.18);
    notes([1047, 1319], 0.12, 'triangle', 0.18, 0.5);
    [0.34, 0.46].forEach((d) => tone({ freq: 1047, dur: 0.45, type: 'triangle', gain: 0.12, delay: d }));
  },
  wahwah: () => [392, 370, 349, 330].forEach((f, i) => tone({ freq: f, to: f * 0.97, dur: i === 3 ? 0.6 : 0.26, type: 'sawtooth', gain: 0.05, delay: i * 0.28 })),
  turn: () => notes([660, 880, 1320], 0.09, 'triangle', 0.15, 0.25),
  shuffle: () => [0, 0.09, 0.18, 0.27, 0.36].forEach((d) => noise(0.08, 1500, 4000, 0.06, d)),
  bling: () => notes([1319, 1760], 0.06, 'triangle', 0.13, 0.3),
  cancel: () => tone({ freq: 520, to: 180, dur: 0.35, type: 'triangle', gain: 0.14 }),
};
