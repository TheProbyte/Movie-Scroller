import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, getToken } from './api';
import type { Bootstrap, PlayerId } from '../shared/types';

type ImgSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' | 'h632';

interface Ctx {
  boot: Bootstrap;
  me: PlayerId | null;
  setMe: (p: PlayerId) => void;
  name: (p: PlayerId) => string;
  img: (path: string | null | undefined, size?: ImgSize) => string | null;
  toast: (msg: string) => void;
  openTitle: (key: string, opts?: { sessionId?: string }) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

const ME_KEY = 'mm.me';
const readMe = (): PlayerId | null => {
  try {
    const v = Number(localStorage.getItem(ME_KEY));
    return v === 1 || v === 2 ? v : null;
  } catch {
    return null;
  }
};

/** Keep every open phone in sync via server-sent events. */
function useLiveSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let closed = false;
    const connect = () => {
      es = new EventSource(`/api/events?token=${encodeURIComponent(getToken())}`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; id?: string };
          if (msg.type === 'session') {
            if (msg.id) qc.invalidateQueries({ queryKey: ['session', msg.id] });
            qc.invalidateQueries({ queryKey: ['sessions'] });
            qc.invalidateQueries({ queryKey: ['active'] });
            qc.invalidateQueries({ queryKey: ['stats'] });
          } else if (msg.type === 'watchlist') {
            qc.invalidateQueries({ queryKey: ['watchlist'] });
            qc.invalidateQueries({ queryKey: ['title'] });
          } else if (msg.type === 'watched') {
            qc.invalidateQueries({ queryKey: ['watched'] });
            qc.invalidateQueries({ queryKey: ['title'] });
            qc.invalidateQueries({ queryKey: ['stats'] });
          } else if (msg.type === 'settings') {
            qc.invalidateQueries({ queryKey: ['boot'] });
          }
        } catch {
          /* ignore malformed */
        }
      };
    };
    connect();
    // Phones suspend background tabs; refresh everything when we come back.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || closed) return;
      if (!es || es.readyState === EventSource.CLOSED) connect();
      qc.invalidateQueries();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, qc]);
}

export function AppProvider({ boot, children }: { boot: Bootstrap; children: ReactNode }) {
  const [me, setMeState] = useState<PlayerId | null>(readMe);
  const [toastMsg, setToastMsg] = useState<{ id: number; msg: string } | null>(null);
  const timer = useRef<number>();
  const navigate = useNavigate();
  const location = useLocation();

  useLiveSync(boot.authorized);

  const setMe = useCallback((p: PlayerId) => {
    try {
      localStorage.setItem(ME_KEY, String(p));
    } catch {
      /* ignore */
    }
    setMeState(p);
  }, []);

  const toast = useCallback((msg: string) => {
    window.clearTimeout(timer.current);
    setToastMsg({ id: Date.now(), msg });
    timer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const openTitle = useCallback(
    (key: string, opts: { sessionId?: string } = {}) => {
      const params = new URLSearchParams(location.search);
      params.set('t', key);
      if (opts.sessionId) params.set('s', opts.sessionId);
      else params.delete('s');
      navigate({ pathname: location.pathname, search: params.toString() }, { state: { ...(location.state ?? {}), sheet: true } });
    },
    [location, navigate],
  );

  const value = useMemo<Ctx>(
    () => ({
      boot,
      me,
      setMe,
      name: (p) => boot.players.find((x) => x.id === p)?.name ?? `Player ${p}`,
      img: (path, size = 'w500') => (path ? `${boot.imageBase}/${size}${path}` : null),
      toast,
      openTitle,
    }),
    [boot, me, setMe, toast, openTitle],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key={toastMsg.id}
            className="toast"
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {toastMsg.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </AppCtx.Provider>
  );
}

export function useBoot() {
  return useQuery({ queryKey: ['boot'], queryFn: api.bootstrap, staleTime: 60_000, retry: 1 });
}
