import type {
  Bootstrap,
  PlayerId,
  Provider,
  Rails,
  SessionDetail,
  SessionFilters,
  SessionMode,
  SessionSummary,
  TasteStats,
  Title,
  TitleDetails,
  TitleState,
  Vote,
  WatchedEntry,
  WatchlistEntry,
  WatchlistSection,
} from '../shared/types';

const TOKEN_KEY = 'mm.token';
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setToken = (t: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* ignore */
  }
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mm-token': getToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(0, 'Can’t reach the MovieMatch server. Check your connection.');
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface TitlePage {
  details: TitleDetails;
  state: TitleState;
  history: { sessionId: string; date: string; votes: Partial<Record<PlayerId, Vote>> }[];
}

export const api = {
  bootstrap: () => req<Bootstrap>('GET', '/bootstrap'),
  auth: (passcode: string) => req<{ token: string }>('POST', '/auth', { passcode }),
  saveSettings: (body: { players?: { name: string }[]; region?: string; services?: number[]; tmdbKey?: string; setupComplete?: boolean }) =>
    req<unknown>('PUT', '/settings', body),
  providers: (region: string) => req<Provider[]>('GET', `/providers?region=${region}`),
  resetDiscovery: () => req('POST', '/reset-discovery'),

  title: (key: string) => req<TitlePage>('GET', `/titles/${key}`),
  titles: (keys: string[]) => req<Record<string, Title>>('POST', '/titles/batch', { keys }),
  search: (q: string) => req<Title[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  rails: () => req<Rails>('GET', '/rails'),

  watchlist: () => req<{ entries: WatchlistEntry[]; titles: Record<string, Title> }>('GET', '/watchlist'),
  addToWatchlist: (items: { key: string; section?: WatchlistSection }[], extra: { addedBy?: PlayerId; sessionId?: string; force?: boolean } = {}) =>
    req('POST', '/watchlist', { items, ...extra }),
  removeFromWatchlist: (key: string) => req('DELETE', `/watchlist/${key}`),

  watched: () => req<{ entries: WatchedEntry[]; titles: Record<string, Title> }>('GET', '/watched'),
  markWatched: (key: string, sessionId?: string) => req('POST', '/watched', { key, sessionId }),
  unmarkWatched: (key: string) => req('DELETE', `/watched/${key}`),
  rate: (key: string, player: PlayerId, rating: number | null) => req('PUT', `/watched/${key}/rating`, { player, rating }),

  sessions: () => req<SessionSummary[]>('GET', '/sessions'),
  activeSessions: () => req<SessionSummary[]>('GET', '/sessions/active'),
  sessionByCode: (code: string) => req<{ id: string }>('GET', `/sessions/code/${encodeURIComponent(code)}`),
  session: (id: string) => req<SessionDetail>('GET', `/sessions/${id}`),
  createSession: (body: { mode: SessionMode; filters: Partial<SessionFilters>; createdBy: PlayerId; firstPlayer: PlayerId }) =>
    req<{ id: string }>('POST', '/sessions', body),
  vote: (id: string, player: PlayerId, key: string, vote: Vote) => req('POST', `/sessions/${id}/votes`, { player, key, vote }),
  undo: (id: string, player: PlayerId, key: string) => req('DELETE', `/sessions/${id}/votes`, { player, key }),
  more: (id: string, count = 10) => req('POST', `/sessions/${id}/more`, { count }),
  choose: (id: string, key: string | null) => req('POST', `/sessions/${id}/choose`, { key }),
  deleteSession: (id: string) => req('DELETE', `/sessions/${id}`),

  stats: () => req<TasteStats>('GET', '/stats'),
};
