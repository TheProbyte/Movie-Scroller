import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { sfx } from './sound';
import { RetroDialog, type DialogOptions } from './components/RetroDialog';
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
  /** Retro dialog box; resolves with the chosen button's value, or null if dismissed. */
  ask: (opts: DialogOptions) => Promise<string | null>;
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

/**
 * Keep both phones in sync by polling. Movie-night data refreshes quickly so
 * partner progress feels live; everything else refreshes at a relaxed pace.
 */
function useLiveSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const visible = () => document.visibilityState === 'visible';
    const fast = window.setInterval(() => {
      if (!visible()) return;
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['active'] });
    }, 4000);
    const slow = window.setInterval(() => {
      if (!visible()) return;
      for (const key of ['watchlist', 'watched', 'sessions', 'title', 'boot']) qc.invalidateQueries({ queryKey: [key] });
    }, 20000);
    // Phones suspend background tabs; refresh everything when we come back.
    const onVisible = () => visible() && qc.invalidateQueries();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(fast);
      window.clearInterval(slow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, qc]);
}

export function AppProvider({ boot, children }: { boot: Bootstrap; children: ReactNode }) {
  const [me, setMeState] = useState<PlayerId | null>(readMe);
  const [toastMsg, setToastMsg] = useState<{ id: number; msg: string } | null>(null);
  const timer = useRef<number>();
  const [dialog, setDialog] = useState<{ opts: DialogOptions; resolve: (v: string | null) => void } | null>(null);
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
    sfx.pop();
    timer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const ask = useCallback((opts: DialogOptions) => new Promise<string | null>((resolve) => setDialog({ opts, resolve })), []);

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
      ask,
    }),
    [boot, me, setMe, toast, openTitle, ask],
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
      <AnimatePresence>
        {dialog && (
          <RetroDialog
            key="dialog"
            opts={dialog.opts}
            onClose={(v) => {
              dialog.resolve(v);
              setDialog(null);
            }}
          />
        )}
      </AnimatePresence>
    </AppCtx.Provider>
  );
}

export function useBoot() {
  return useQuery({ queryKey: ['boot'], queryFn: api.bootstrap, staleTime: 60_000, retry: 1 });
}
