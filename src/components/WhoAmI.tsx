import { AnimatePresence } from 'framer-motion';
import { useApp } from '../context';
import { Sheet } from './Sheet';
import type { PlayerId } from '../../shared/types';

/** Asked once per phone, so two-phone nights know who is swiping. */
export function WhoAmI() {
  const { boot, setMe } = useApp();
  return (
    <AnimatePresence>
      <Sheet onClose={() => {}}>
        <div style={{ textAlign: 'center', padding: '8px 4px 6px' }}>
          <div style={{ fontSize: 40 }}>📱</div>
          <h2 className="display" style={{ fontSize: 30, margin: '8px 0 6px' }}>Whose phone is this?</h2>
          <p className="muted" style={{ marginBottom: 22 }}>So two-phone movie nights know who’s swiping. You can change it in settings.</p>
          <div className="stack">
            {boot.players.map((p) => (
              <button key={p.id} className="btn lg block" onClick={() => setMe(p.id as PlayerId)}>
                <span className="dot" style={{ background: p.id === 1 ? 'var(--p1)' : 'var(--p2)' }} />
                I’m {p.name}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </AnimatePresence>
  );
}
