export type MediaType = 'movie' | 'tv';
export type Vote = 'no' | 'maybe' | 'yes';
export type PlayerId = 1 | 2;

export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}

export interface Availability {
  link: string | null;
  stream: Provider[];
  free: Provider[];
  rent: Provider[];
  buy: Provider[];
}

/** A compact, cacheable snapshot of a movie or show. */
export interface Title {
  key: string; // "movie-603" / "tv-1399"
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null; // TMDB path, e.g. "/abc.jpg"
  backdrop: string | null;
  genres: string[];
  runtime: number | null; // minutes (episode runtime for TV)
  seasons: number | null;
  rating: number; // 0-10 TMDB audience score
  voteCount: number;
  certification: string | null;
  availability: Availability | null; // for the household region
}

export interface Person {
  id: number;
  name: string;
  role: string;
  photo: string | null;
}

export interface TitleDetails extends Title {
  tagline: string | null;
  cast: Person[];
  crew: Person[]; // directors / creators
  trailer: { key: string; name: string } | null;
  status: string | null;
}

export interface WatchedEntry {
  key: string;
  watchedAt: string;
  ratings: Partial<Record<PlayerId, number>>;
  sessionId: string | null;
}

export type WatchlistSection = 'both' | 'maybe' | 'saved';

export interface WatchlistEntry {
  key: string;
  section: WatchlistSection;
  addedAt: string;
  addedBy: PlayerId | null;
  sessionId: string | null;
}

export interface TitleState {
  watchlist: WatchlistEntry | null;
  watched: WatchedEntry | null;
}

export type RuntimeFilter = 'any' | 'short' | 'medium' | 'long';
export type PeriodFilter = 'any' | 'new' | '2020s' | '2010s' | '2000s' | '1990s' | '1980s' | 'classic';

export interface SessionFilters {
  type: 'movie' | 'tv' | 'both';
  genres: string[];
  moods: string[];
  runtime: RuntimeFilter;
  period: PeriodFilter;
  onlyMyServices: boolean;
  minRating: number; // 0 = any
  includeRewatches: boolean;
  source: 'discover' | 'watchlist';
  size: number;
}

export type SessionMode = 'pass' | 'duo';
export type SessionStatus = 'swiping' | 'complete';

export interface Progress {
  done: number;
  total: number;
}

export interface SessionSummary {
  id: string;
  code: string;
  mode: SessionMode;
  status: SessionStatus;
  filters: SessionFilters;
  createdAt: string;
  completedAt: string | null;
  createdBy: PlayerId;
  firstPlayer: PlayerId;
  chosenKey: string | null;
  deckSize: number;
  progress: Record<PlayerId, Progress>;
  perfectKeys: string[];
  possibleKeys: string[];
  posterPreview: (string | null)[];
}

export interface SessionDetail extends SessionSummary {
  deck: Title[];
  /** Keys each player has already voted on (never the votes themselves). */
  votedKeys: Record<PlayerId, string[]>;
  /** Only present once both players have finished. */
  results: SessionResults | null;
}

export interface SessionResults {
  votes: Record<string, Partial<Record<PlayerId, Vote>>>;
  perfect: string[];
  possible: string[];
}

export interface Player {
  id: PlayerId;
  name: string;
}

export interface AppSettings {
  region: string;
  services: number[];
  setupComplete: boolean;
}

export interface Bootstrap {
  authRequired: boolean;
  authorized: boolean;
  tmdbConfigured: boolean;
  imageBase: string;
  players: Player[];
  settings: AppSettings;
}

export interface StatsGenre {
  genre: string;
  votes: number;
  agreement: number; // 0..1
  yesRate: Record<PlayerId, number>;
}

export interface TasteStats {
  sharedVotes: number;
  agreement: number; // 0..1
  sessions: number;
  perfectMatches: number;
  possibleMatches: number;
  watchedTogether: number;
  avgRating: Record<PlayerId, number | null>;
  yesRate: Record<PlayerId, number>;
  favoriteGenres: Record<PlayerId, { genre: string; yes: number }[]>;
  genres: StatsGenre[];
  splits: { key: string; lover: PlayerId }[];
  ratingGaps: { key: string; ratings: Record<PlayerId, number> }[];
  titles: Record<string, Title>;
}

export interface Rails {
  forYou: Title[];
  trending: Title[];
  newReleases: Title[];
  popularTv: Title[];
  classics: Title[];
  onOurServices: Title[];
}

export const DEFAULT_FILTERS: SessionFilters = {
  type: 'both',
  genres: [],
  moods: [],
  runtime: 'any',
  period: 'any',
  onlyMyServices: false,
  minRating: 0,
  includeRewatches: false,
  source: 'discover',
  size: 20,
};

export const otherPlayer = (p: PlayerId): PlayerId => (p === 1 ? 2 : 1);
export const titleKey = (type: MediaType, id: number) => `${type}-${id}`;
export function parseKey(key: string): { type: MediaType; id: number } | null {
  const m = /^(movie|tv)-(\d+)$/.exec(key);
  return m ? { type: m[1] as MediaType, id: Number(m[2]) } : null;
}

/** Perfect = yes+yes. Possible = yes+maybe or maybe+maybe. Any "no" excludes. */
export function classifyMatch(a: Vote | undefined, b: Vote | undefined): 'perfect' | 'possible' | null {
  if (!a || !b || a === 'no' || b === 'no') return null;
  if (a === 'yes' && b === 'yes') return 'perfect';
  return 'possible';
}
