import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { ServicesPicker } from '../components/ServicesPicker';
import { REGIONS } from '../../shared/catalog';
import type { PlayerId } from '../../shared/types';

type Step = 'welcome' | 'tmdb' | 'names' | 'services' | 'me';

function guessRegion() {
  const tag = navigator.language?.split('-')[1]?.toUpperCase();
  return REGIONS.some((r) => r.code === tag) ? tag! : 'US';
}

/** First-run setup. On a second phone (already set up) this never shows. */
export function Setup() {
  const { boot, setMe, toast } = useApp();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('welcome');
  const [key, setKey] = useState('');
  const [names, setNames] = useState(boot.settings.setupComplete ? boot.players.map((p) => p.name) : ['', '']);
  const [region, setRegion] = useState(boot.settings.region !== 'US' ? boot.settings.region : guessRegion());
  const [services, setServices] = useState<number[]>(boot.settings.services);
  const [busy, setBusy] = useState(false);
  const [tmdbOk, setTmdbOk] = useState(boot.tmdbConfigured);

  const steps: Step[] = ['welcome', ...(boot.tmdbConfigured ? [] : (['tmdb'] as Step[])), 'names', 'services', 'me'];
  const next = () => setStep(steps[steps.indexOf(step) + 1]);

  const saveKey = async () => {
    setBusy(true);
    try {
      await api.saveSettings({ tmdbKey: key.trim() });
      setTmdbOk(true);
      next();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (me: PlayerId) => {
    setBusy(true);
    try {
      await api.saveSettings({
        players: names.map((n, i) => ({ name: n.trim() || `Player ${i + 1}` })),
        region,
        services,
        setupComplete: true,
      });
      setMe(me);
      await qc.invalidateQueries({ queryKey: ['boot'] });
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page no-tabs setup">
      <div className="setup-dots" aria-hidden>
        {steps.map((s) => (
          <span key={s} className={s === step ? 'on' : ''} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          {step === 'welcome' && (
            <div className="setup-welcome">
              <span className="logo-disc setup-logo" aria-hidden />
              <h1 className="chrome" style={{ fontSize: 40, lineHeight: 1, textAlign: 'center' }}>FlickPick</h1>
              <p className="logo-sub" style={{ textAlign: 'center', fontSize: 16, marginTop: 8 }}>★ Movie night, decided together ★</p>
              <p className="muted" style={{ marginTop: 16, fontSize: 16 }}>
                Swipe on movies and shows separately, then see what you both want to watch. Let’s set things up — it takes a minute.
              </p>
              <button className="btn primary lg block" style={{ marginTop: 36 }} onClick={next}>
                Get started <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 'tmdb' && (
            <div>
              <h1 className="page-title">Connect to TMDB</h1>
              <p className="page-sub" style={{ marginBottom: 20 }}>
                FlickPick uses The Movie Database for posters, trailers and streaming info. A free API key takes two minutes:
              </p>
              <ol className="muted setup-steps">
                <li>
                  Create a free account at{' '}
                  <a href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>themoviedb.org</a>
                </li>
                <li>
                  Open{' '}
                  <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Settings → API</a>{' '}
                  and request a developer key
                </li>
                <li>Paste the “API Key” or “API Read Access Token” below</li>
              </ol>
              <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your TMDB key" autoComplete="off" aria-label="TMDB key" />
              <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={!key.trim() || busy} onClick={saveKey}>
                {busy ? 'Checking…' : 'Connect'}
              </button>
            </div>
          )}

          {step === 'names' && (
            <div>
              <h1 className="page-title">Who’s watching?</h1>
              <p className="page-sub" style={{ marginBottom: 22 }}>Two players, two sets of opinions.</p>
              {[0, 1].map((i) => (
                <div className="field" key={i}>
                  <label htmlFor={`setup-name-${i}`}>
                    <span className="dot" style={{ background: i ? 'var(--p2)' : 'var(--p1)', marginRight: 8 }} />
                    Player {i + 1}
                  </label>
                  <input
                    id={`setup-name-${i}`}
                    className="input"
                    value={names[i]}
                    maxLength={24}
                    placeholder={i ? 'e.g. Katie' : 'Your name'}
                    onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </div>
              ))}
              <button className="btn primary lg block" style={{ marginTop: 12 }} disabled={!names[0].trim() || !names[1].trim()} onClick={next}>
                Continue
              </button>
            </div>
          )}

          {step === 'services' && (
            <div>
              <h1 className="page-title">What do you subscribe to?</h1>
              <p className="page-sub" style={{ marginBottom: 18 }}>We’ll highlight these and can limit movie nights to them.</p>
              <select className="input" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region" style={{ marginBottom: 16 }}>
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
              {tmdbOk && <ServicesPicker region={region} value={services} onChange={setServices} />}
              <button className="btn primary lg block" style={{ marginTop: 22 }} onClick={next}>
                {services.length ? `Continue with ${services.length}` : 'Skip for now'}
              </button>
            </div>
          )}

          {step === 'me' && (
            <div style={{ textAlign: 'center', paddingTop: 30 }}>
              <div style={{ fontSize: 48 }}>📱</div>
              <h1 className="page-title" style={{ marginTop: 10 }}>Whose phone is this?</h1>
              <p className="page-sub" style={{ marginBottom: 26 }}>Open FlickPick on the other phone too — it’ll sync automatically.</p>
              <div className="stack">
                {[0, 1].map((i) => (
                  <button key={i} className="btn lg block" disabled={busy} onClick={() => finish((i + 1) as PlayerId)}>
                    <span className="dot" style={{ background: i ? 'var(--p2)' : 'var(--p1)' }} />
                    I’m {names[i].trim() || `Player ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
