import type { PeriodFilter, RuntimeFilter } from './types';

/**
 * App-level genres mapped onto TMDB's genre ids. TMDB uses different genre
 * lists for movies and TV, so each friendly genre maps to both.
 */
export const GENRES: { id: string; label: string; emoji: string; movie: number[]; tv: number[] }[] = [
  { id: 'comedy', label: 'Comedy', emoji: '😂', movie: [35], tv: [35] },
  { id: 'horror', label: 'Horror', emoji: '👻', movie: [27], tv: [9648, 10765] },
  { id: 'thriller', label: 'Thriller', emoji: '🔪', movie: [53], tv: [80, 9648] },
  { id: 'scifi', label: 'Sci‑Fi', emoji: '🚀', movie: [878], tv: [10765] },
  { id: 'fantasy', label: 'Fantasy', emoji: '🐉', movie: [14], tv: [10765] },
  { id: 'drama', label: 'Drama', emoji: '🎭', movie: [18], tv: [18] },
  { id: 'romance', label: 'Romance', emoji: '💕', movie: [10749], tv: [18] },
  { id: 'animation', label: 'Animation', emoji: '✏️', movie: [16], tv: [16] },
  { id: 'mystery', label: 'Mystery', emoji: '🔎', movie: [9648], tv: [9648] },
  { id: 'adventure', label: 'Adventure', emoji: '🧭', movie: [12], tv: [10759] },
  { id: 'action', label: 'Action', emoji: '💥', movie: [28], tv: [10759] },
  { id: 'crime', label: 'Crime', emoji: '🕵️', movie: [80], tv: [80] },
  { id: 'family', label: 'Family', emoji: '🏡', movie: [10751], tv: [10751] },
  { id: 'documentary', label: 'Documentary', emoji: '🎥', movie: [99], tv: [99] },
  { id: 'history', label: 'History', emoji: '🏛️', movie: [36], tv: [10768] },
  { id: 'war', label: 'War', emoji: '🎖️', movie: [10752], tv: [10768] },
  { id: 'western', label: 'Western', emoji: '🤠', movie: [37], tv: [37] },
  { id: 'music', label: 'Music', emoji: '🎵', movie: [10402], tv: [] },
];

/** Moods translate into a blend of genres. */
export const MOODS: { id: string; label: string; emoji: string; genres: string[] }[] = [
  { id: 'cozy', label: 'Cozy', emoji: '🛋️', genres: ['comedy', 'romance', 'family', 'animation'] },
  { id: 'funny', label: 'Funny', emoji: '😆', genres: ['comedy'] },
  { id: 'scary', label: 'Scary', emoji: '😱', genres: ['horror', 'thriller'] },
  { id: 'exciting', label: 'Exciting', emoji: '⚡', genres: ['action', 'adventure', 'thriller', 'scifi'] },
  { id: 'emotional', label: 'Emotional', emoji: '🥹', genres: ['drama', 'romance'] },
  { id: 'relaxing', label: 'Relaxing', emoji: '🌙', genres: ['comedy', 'family', 'animation', 'documentary'] },
  { id: 'thoughtful', label: 'Thought‑provoking', emoji: '🧠', genres: ['scifi', 'drama', 'mystery', 'documentary'] },
  { id: 'romantic', label: 'Romantic', emoji: '🌹', genres: ['romance'] },
  { id: 'magical', label: 'Magical', emoji: '✨', genres: ['fantasy', 'animation', 'adventure'] },
];

export const RUNTIMES: { id: RuntimeFilter; label: string; lte?: number; gte?: number }[] = [
  { id: 'any', label: 'Any length' },
  { id: 'short', label: 'Under 90 min', lte: 90 },
  { id: 'medium', label: 'Under 2 hrs', lte: 120 },
  { id: 'long', label: 'Over 2 hrs', gte: 120 },
];

export function periodRange(p: PeriodFilter, now = new Date()): { gte?: string; lte?: string } {
  const decade = (start: number) => ({ gte: `${start}-01-01`, lte: `${start + 9}-12-31` });
  switch (p) {
    case 'new': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 18);
      return { gte: d.toISOString().slice(0, 10), lte: now.toISOString().slice(0, 10) };
    }
    case '2020s': return decade(2020);
    case '2010s': return decade(2010);
    case '2000s': return decade(2000);
    case '1990s': return decade(1990);
    case '1980s': return decade(1980);
    case 'classic': return { lte: '1979-12-31' };
    default: return {};
  }
}

export const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: 'any', label: 'Any year' },
  { id: 'new', label: 'New releases' },
  { id: '2020s', label: '2020s' },
  { id: '2010s', label: '2010s' },
  { id: '2000s', label: '2000s' },
  { id: '1990s', label: '90s' },
  { id: '1980s', label: '80s' },
  { id: 'classic', label: 'Classics' },
];

export const RATINGS: { value: number; label: string }[] = [
  { value: 0, label: 'Any rating' },
  { value: 6, label: '6+' },
  { value: 7, label: '7+' },
  { value: 8, label: '8+' },
];

export const REGIONS: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'ZA', name: 'South Africa' },
];
