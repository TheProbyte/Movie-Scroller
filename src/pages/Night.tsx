import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Share2, Volume2, VolumeX, X } from 'lucide-react';
import { ApiError, api } from '../api';
import { useApp } from '../context';
import { SwipeDeck } from '../components/SwipeDeck';
import { Results } from '../components/Results';
import { Poster } from '../components/Poster';
import { BouncingDisc, Confetti } from '../components/Fx';
import { sfx, useMuted } from '../sound';
import type { PlayerId, SessionDetail, Title, Vote } from '../../shared/types';
import { otherPlayer } from '../../shared/types';

// Deterministic per-player shuffle so each person sees the deck in a different order.
function seededOrder(keys: string[], seed: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...keys];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

/** "Leave" asks whether to pause (swipes are saved) or cancel the whole night. */
function useLeaveNight(id: string) {
  const { ask, toast } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    const choice = await ask({
      title: 'Leave movie night?',
      icon: '📼',
      message: 'Your swipes are saved — you can pick up where you left off from the home screen.',
      buttons: [
        { label: 'Keep swiping', value: 'stay', variant: 'primary' },
        { label: 'Pause & go home', value: 'leave' },
        { label: 'Cancel movie night', value: 'cancel', variant: 'danger' },
      ],
    });
    if (choice === 'leave') navigate('/');
    if (choice !== 'cancel') return;
    const sure = await ask({
      title: 'Cancel movie night',
      icon: '⚠️',
      message: 'This removes tonight’s titles and everyone’s swipes. It can’t be undone.',
      buttons: [
        { label: 'Yes, cancel it', value: 'yes', variant: 'danger' },
        { label: 'Never mind', value: 'no' },
      ],
    });
    if (sure !== 'yes') return;
    try {
      await api.deleteSession(id);
      sfx.cancel();
      qc.removeQueries({ queryKey: ['session', id] });
      qc.invalidateQueries({ queryKey: ['active'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast('Movie night cancelled');
      navigate('/', { replace: true });
    } catch (e) {
      toast((e as Error).message);
    }
  };
}

export function Night() {
  const { id = '' } = useParams();
  const { me, toast } = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['session', id], queryFn: () => api.session(id) });
  const s = q.data;

  // Optimistic local votes per player (null = undone) layered over the server state.
  const [local, setLocal] = useState<Record<PlayerId, Record<string, Vote | null>>>({ 1: {}, 2: {} });
  const [undoStack, setUndoStack] = useState<{ player: PlayerId; key: string }[]>([]);
  const [ackTick, setAckTick] = useState(0);
  const [, setRevealTick] = useState(0);

  const votedBy = (p: PlayerId): Set<string> => {
    const set = new Set(s?.votedKeys[p] ?? []);
    for (const [k, v] of Object.entries(local[p])) {
      if (v) set.add(k);
      else set.delete(k);
    }
    return set;
  };

  // Who is swiping on this phone right now?
  let swiper: PlayerId | null = null;
  if (s) {
    if (s.mode === 'duo') swiper = me;
    else {
      const firstDone = votedBy(s.firstPlayer);
      swiper = s.deck.every((t) => firstDone.has(t.key)) ? otherPlayer(s.firstPlayer) : s.firstPlayer;
    }
  }

  // Depends on the deck only (not progress), so partner updates don't reshuffle anything.
  const deck = s?.deck;
  const deckOrder = useMemo(() => {
    if (!deck || !swiper) return [] as Title[];
    const byKey = new Map(deck.map((t) => [t.key, t]));
    return seededOrder(
      deck.map((t) => t.key),
      `${id}:${swiper}`,
    ).map((k) => byKey.get(k)!);
  }, [deck, id, swiper]);

  const done = swiper ? votedBy(swiper) : new Set<string>();
  const remaining = deckOrder.filter((t) => !done.has(t.key));

  const voteM = useMutation({
    mutationFn: ({ player, key, vote }: { player: PlayerId; key: string; vote: Vote; last: boolean }) => api.vote(id, player, key, vote),
    // Refetching after every swipe caused jank mid-animation; polling covers progress,
    // so only refresh right away once this player's deck is finished.
    onSuccess: (_d, v) => {
      if (v.last) qc.invalidateQueries({ queryKey: ['session', id] });
    },
    onError: (e: Error, v) => {
      toast(e.message);
      setLocal((l) => ({ ...l, [v.player]: { ...l[v.player], [v.key]: null } }));
      qc.invalidateQueries({ queryKey: ['session', id] });
    },
  });

  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="page no-tabs center">
        <div style={{ fontSize: 52 }}>{gone ? '📼' : '🎞️'}</div>
        <h1 className="page-title chrome" style={{ fontSize: 28 }}>{gone ? 'Night cancelled' : 'Hmm…'}</h1>
        <p className="muted">{gone ? 'This movie night was cancelled. Start a fresh one any time!' : (q.error as Error).message}</p>
        <a className="btn primary" href="/">Back home</a>
      </div>
    );
  }
  if (!s) {
    return (
      <div className="page no-tabs center">
        <div className="spinner" />
      </div>
    );
  }

  if (s.status === 'complete') {
    // Keyed by deck size so a reveal plays again after dealing more titles.
    const revealKey = `mm.revealed.${id}.${s.deck.length}`;
    const fresh = s.completedAt && Date.now() - new Date(s.completedAt).getTime() < 3 * 60 * 60 * 1000;
    if (fresh && store.get(revealKey) !== '1')
      return (
        <Reveal
          session={s}
          onDone={() => {
            store.set(revealKey, '1');
            setRevealTick((t) => t + 1);
          }}
        />
      );
    return <Results session={s} />;
  }

  if (!swiper) return <div className="page no-tabs center">Pick who you are to join this movie night.</div>;

  const total = s.deck.length;
  const doneCount = total - remaining.length;
  // Pass & play re-prompts the handoff after more cards are dealt; two-phone mode only shows the lobby once.
  const ackKey = s.mode === 'pass' ? `mm.ack.${id}.${swiper}.${total}` : `mm.ack.${id}.${swiper}`;
  const acked = store.get(ackKey) === '1';

  if (!acked && remaining.length > 0) {
    const ack = () => {
      store.set(ackKey, '1');
      setAckTick(ackTick + 1);
    };
    if (s.mode === 'pass') return <Handoff session={s} player={swiper} onGo={ack} />;
    return <Lobby session={s} me={swiper} onGo={ack} />;
  }

  if (remaining.length === 0) {
    if (s.mode === 'pass')
      return (
        <div className="page no-tabs center">
          <div className="spinner" />
          <p>Tallying your votes…</p>
        </div>
      );
    return <Waiting session={s} me={swiper} />;
  }

  return (
    <SwipeScreen
      session={s}
      swiper={swiper}
      done={doneCount}
      total={total}
      cards={remaining}
      canUndo={undoStack[undoStack.length - 1]?.player === swiper}
      onVote={(t, v) => {
        const player = swiper!;
        setLocal((l) => ({ ...l, [player]: { ...l[player], [t.key]: v } }));
        setUndoStack((u) => [...u, { player, key: t.key }]);
        voteM.mutate({ player, key: t.key, vote: v, last: remaining.length === 1 });
      }}
      onUndo={() => {
        const last = undoStack[undoStack.length - 1];
        if (!last || last.player !== swiper) return;
        setUndoStack((u) => u.slice(0, -1));
        setLocal((l) => ({ ...l, [last.player]: { ...l[last.player], [last.key]: null } }));
        api
          .undo(id, last.player, last.key)
          .then(() => qc.invalidateQueries({ queryKey: ['session', id] }))
          .catch((e: Error) => toast(e.message));
      }}
    />
  );
}

// ---------------------------------------------------------------------------

function SwipeScreen({
  session,
  swiper,
  done,
  total,
  cards,
  onVote,
  onUndo,
  canUndo,
}: {
  session: SessionDetail;
  swiper: PlayerId;
  done: number;
  total: number;
  cards: Title[];
  onVote: (t: Title, v: Vote) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const { name } = useApp();
  const leave = useLeaveNight(session.id);
  const [muted, setMuted] = useMuted();
  const partner = otherPlayer(swiper);
  const partnerProgress = session.progress[partner];

  return (
    <div className="swipe-screen">
      <header className="swipe-header">
        <button className="icon-btn" onClick={leave} aria-label="Leave or cancel movie night">
          <X size={20} strokeWidth={2.6} />
        </button>
        <div className="grow" style={{ textAlign: 'center' }}>
          <div className="swipe-who">
            <span className="dot" style={{ background: swiper === 1 ? 'var(--p1)' : 'var(--p2)' }} />
            {name(swiper)}
            <span className="faint">
              · {Math.min(done + 1, total)} of {total}
            </span>
          </div>
          <div className="progress">
            <motion.div className="progress-fill" animate={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
        {session.mode === 'duo' && (
          <div className="partner-pill" title={`${name(partner)}'s progress`}>
            <span className="dot" style={{ background: partner === 1 ? 'var(--p1)' : 'var(--p2)' }} />
            <span className="led">{partnerProgress.done}/{partnerProgress.total}</span>
          </div>
        )}
        <button className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sounds on' : 'Mute sounds'}>
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      </header>

      <SwipeDeck cards={cards} onVote={onVote} onUndo={onUndo} canUndo={canUndo} />
      <p className="swipe-hint faint">Swipe right for yes · left for no · up for maybe · tap for details</p>
    </div>
  );
}

function Handoff({ session, player, onGo }: { session: SessionDetail; player: PlayerId; onGo: () => void }) {
  const { name } = useApp();
  const leave = useLeaveNight(session.id);
  const isFirst = player === session.firstPlayer && session.votedKeys[player].length === 0;
  useEffect(() => {
    const t = window.setTimeout(() => sfx.turn(), 350);
    return () => window.clearTimeout(t);
  }, []);
  const color = player === 1 ? 'var(--p1)' : 'var(--p2)';
  const posters = session.deck.slice(0, 5);

  return (
    <div className="page no-tabs handoff">
      <button className="icon-btn corner-btn" onClick={leave} aria-label="Leave or cancel movie night">
        <X size={20} strokeWidth={2.6} />
      </button>
      <div className="fan">
        {posters.map((t, i) => (
          <motion.div
            key={t.key}
            className="fan-card"
            initial={{ rotate: 0, y: 40, opacity: 0 }}
            animate={{ rotate: (i - 2) * 9, x: (i - 2) * 34, y: Math.abs(i - 2) * 10, opacity: 1 }}
            transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200, damping: 18 }}
          >
            <Poster title={t} size="w185" eager />
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ textAlign: 'center' }}>
        {isFirst ? (
          <>
            <p className="eyebrow">Pass & Play · {session.deck.length} titles</p>
            <h1 className="handoff-title">
              <span style={{ color }}>{name(player)}</span>, you’re up first!
            </h1>
            <p className="muted" style={{ maxWidth: 320, margin: '12px auto 0' }}>
              Swipe through every title. Your picks stay secret until {name(otherPlayer(player))} has had a turn.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">Hand the phone over</p>
            <h1 className="handoff-title">
              <span style={{ color }}>{name(player)}</span>’s turn!
            </h1>
            <p className="muted" style={{ maxWidth: 320, margin: '12px auto 0' }}>
              Same titles, shuffled into a new order. No peeking at each other’s picks — results are revealed when you’re done.
            </p>
          </>
        )}
      </motion.div>
      <motion.button className="btn primary lg block" style={{ marginTop: 32, maxWidth: 360 }} onClick={onGo} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        ▶ I’m {name(player)} — let’s go
      </motion.button>
    </div>
  );
}

function shareUrl(code: string) {
  return `${window.location.origin}/night/join?code=${code}`;
}

function Lobby({ session, me, onGo }: { session: SessionDetail; me: PlayerId; onGo: () => void }) {
  const { name, toast } = useApp();
  const leave = useLeaveNight(session.id);
  const partner = otherPlayer(me);
  const p = session.progress[partner];
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = shareUrl(session.code);
    if (typeof navigator.share === "function") {
      navigator.share({ title: 'Movie night?', text: `Join our movie night with code ${session.code}`, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      toast('Link copied');
    }
  };

  return (
    <div className="page no-tabs handoff">
      <button className="icon-btn corner-btn" onClick={leave} aria-label="Leave or cancel movie night">
        <X size={20} strokeWidth={2.6} />
      </button>
      <p className="eyebrow">Two-phone movie night</p>
      <h1 className="handoff-title" style={{ marginBottom: 6 }}>Your room code</h1>
      <div className="code-big" aria-label={`Code ${session.code.split('').join(' ')}`}>
        {session.code.split('').map((c, i) => (
          <motion.span key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.07 }}>
            {c}
          </motion.span>
        ))}
      </div>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
        {name(partner)} can open MovieMatch and tap <strong>Join with code</strong>, or use your link.
      </p>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" onClick={share}>
          {copied ? <Check size={18} /> : typeof navigator.share === "function" ? <Share2 size={18} /> : <Copy size={18} />} Share invite
        </button>
      </div>
      <div className="card row" style={{ marginTop: 26, width: '100%', maxWidth: 360 }}>
        <span className="dot" style={{ background: partner === 1 ? 'var(--p1)' : 'var(--p2)' }} />
        <span className="grow">{name(partner)}</span>
        <span className="faint">{p.done > 0 ? <span className="led">{p.done}/{p.total}</span> : 'Not started yet'}</span>
      </div>
      <button className="btn primary lg block" style={{ marginTop: 22, maxWidth: 360 }} onClick={onGo}>
        ▶ Start swiping ({session.deck.length})
      </button>
    </div>
  );
}

function Waiting({ session, me }: { session: SessionDetail; me: PlayerId }) {
  const { name } = useApp();
  const navigate = useNavigate();
  const leave = useLeaveNight(session.id);
  const partner = otherPlayer(me);
  const p = session.progress[partner];
  return (
    <div className="page no-tabs handoff">
      <BouncingDisc />
      <h1 className="handoff-title">All done!</h1>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 320, marginTop: 8 }}>
        Waiting for {name(partner)} to finish. Your matches will appear here automatically.
      </p>
      <div className="card" style={{ marginTop: 26, width: '100%', maxWidth: 360 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="dot" style={{ background: partner === 1 ? 'var(--p1)' : 'var(--p2)' }} />
            {name(partner)}
          </span>
          <span className="led">
            {p.done}/{p.total}
          </span>
        </div>
        <div className="progress">
          <motion.div className="progress-fill" animate={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }} />
        </div>
      </div>
      <p className="faint" style={{ marginTop: 16 }}>
        Room code <span className="led">{session.code}</span>
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => navigate('/')}>
          Back home
        </button>
        <button className="btn ghost" onClick={leave}>
          Cancel night
        </button>
      </div>
    </div>
  );
}

function Reveal({ session, onDone }: { session: SessionDetail; onDone: () => void }) {
  const [stage, setStage] = useState<'drumroll' | 'result'>('drumroll');
  const perfect = session.results?.perfect.length ?? 0;
  const possible = session.results?.possible.length ?? 0;
  const byKey = new Map(session.deck.map((t) => [t.key, t]));
  const highlight = [...(session.results?.perfect ?? []), ...(session.results?.possible ?? [])].slice(0, 3).map((k) => byKey.get(k)!);

  useEffect(() => {
    // Drumroll, then the big reveal.
    const ticks = Array.from({ length: 14 }, (_, i) => window.setTimeout(() => sfx.tick(), i * 120));
    const t = window.setTimeout(() => {
      setStage('result');
      navigator.vibrate?.([20, 60, 30]);
      if (perfect || possible) sfx.fanfare();
      else sfx.wahwah();
    }, 1900);
    return () => {
      ticks.forEach(window.clearTimeout);
      window.clearTimeout(t);
    };
  }, [perfect, possible]);

  return (
    <div className="page no-tabs handoff reveal">
      <AnimatePresence mode="wait">
        {stage === 'drumroll' ? (
          <motion.div key="drum" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }} style={{ textAlign: 'center' }}>
            <div className="shuffle">
              {session.deck.slice(0, 6).map((t, i) => (
                <motion.div
                  key={t.key}
                  className="shuffle-card"
                  animate={{ x: [0, (i % 2 ? 1 : -1) * 70, 0], rotate: [0, (i % 2 ? 1 : -1) * 12, 0], zIndex: [i, 6 - i, i] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.12 }}
                >
                  <Poster title={t} size="w185" eager />
                </motion.div>
              ))}
            </div>
            <h1 className="handoff-title">Comparing your picks…</h1>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} style={{ textAlign: 'center', width: '100%' }}>
            {(perfect > 0 || possible > 0) && <Confetti />}
            {highlight.length > 0 ? (
              <div className="fan" style={{ marginBottom: 26 }}>
                {highlight.map((t, i) => (
                  <motion.div
                    key={t.key}
                    className="fan-card big"
                    initial={{ y: 60, opacity: 0, rotate: 0 }}
                    animate={{ y: i === 1 ? -10 : 8, x: (i - (highlight.length - 1) / 2) * 70, rotate: (i - (highlight.length - 1) / 2) * 10, opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.12, type: 'spring', stiffness: 180, damping: 16 }}
                  >
                    <Poster title={t} size="w342" eager />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 64, marginBottom: 12 }}>🫣</div>
            )}
            <p className="eyebrow">{perfect ? 'It’s a match!' : possible ? 'Close enough!' : 'Tough crowd'}</p>
            <h1 className="handoff-title">
              {perfect
                ? `${perfect} perfect match${perfect === 1 ? '' : 'es'}`
                : possible
                  ? `${possible} possible match${possible === 1 ? '' : 'es'}`
                  : 'No matches this round'}
            </h1>
            {perfect > 0 && possible > 0 && <p className="muted" style={{ marginTop: 8 }}>plus {possible} possible</p>}
            <button className="btn primary lg block" style={{ marginTop: 30, maxWidth: 360, marginInline: 'auto' }} onClick={onDone}>
              {perfect || possible ? 'See our matches' : 'See what happened'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
