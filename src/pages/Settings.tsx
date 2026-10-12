import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeader } from '../components/PageHeader';
import { ServicesPicker } from '../components/ServicesPicker';
import { REGIONS } from '../../shared/catalog';
import { sfx, useMuted } from '../sound';
import type { PlayerId } from '../../shared/types';

export function Settings() {
  const { boot, me, setMe, toast, ask } = useApp();
  const [muted, setMuted] = useMuted();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [names, setNames] = useState(boot.players.map((p) => p.name));
  const [region, setRegion] = useState(boot.settings.region);
  const [services, setServices] = useState<number[]>(boot.settings.services);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (body: Parameters<typeof api.saveSettings>[0], msg = 'Saved') => {
    setSaving(true);
    try {
      await api.saveSettings(body);
      await qc.invalidateQueries({ queryKey: ['boot'] });
      qc.invalidateQueries({ queryKey: ['rails'] });
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetData = async (scope: 'nights' | 'all') => {
    const v = await ask({
      title: scope === 'all' ? 'Reset everything' : 'Reset nights & taste',
      icon: '🧹',
      message:
        scope === 'all'
          ? 'This permanently deletes all movie nights, swipes, stats, your watchlist, watched list and ratings. This can’t be undone.'
          : 'This permanently deletes all movie nights, swipes and taste stats. Your watchlist and watched list stay.',
      buttons: [
        { label: 'Yes, wipe it', value: 'yes', variant: 'danger' },
        { label: 'Cancel', value: 'no' },
      ],
    });
    if (v !== 'yes') return;
    try {
      await api.resetAll(scope);
      // Forget this phone's "already shown" markers for old nights.
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('mm.revealed.') || k.startsWith('mm.ack.')) localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      qc.clear();
      sfx.cancel();
      toast('All clean — fresh start ✨');
      navigate('/', { replace: true });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const dirty =
    names.join() !== boot.players.map((p) => p.name).join() ||
    region !== boot.settings.region ||
    services.slice().sort().join() !== boot.settings.services.slice().sort().join();

  return (
    <div className="page no-tabs">
      <PageHeader back="/" title="Settings" />

      <div className="section-title" style={{ marginTop: 0 }}>The two of you</div>
      <div className="card">
        {[0, 1].map((i) => (
          <div className="field" key={i}>
            <label htmlFor={`name-${i}`}>Player {i + 1}</label>
            <input id={`name-${i}`} className="input" value={names[i]} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>This phone belongs to</label>
          <div className="segmented">
            {([1, 2] as PlayerId[]).map((p) => (
              <button key={p} className={me === p ? 'on' : ''} onClick={() => setMe(p)}>
                {names[p - 1] || `Player ${p}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Region</div>
      <select className="input" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
        {REGIONS.map((r) => (
          <option key={r.code} value={r.code}>{r.name}</option>
        ))}
      </select>
      <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>Streaming availability is shown for this country.</p>

      <div className="section-title">Our streaming services</div>
      <ServicesPicker region={region} value={services} onChange={setServices} />

      <button
        className="btn primary lg block"
        style={{ marginTop: 22 }}
        disabled={!dirty || saving}
        onClick={() => save({ players: names.map((name) => ({ name })), region, services })}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      <div className="section-title">Sound</div>
      <div className="card" style={{ padding: '4px 16px' }}>
        <button
          className="toggle-row switch-row"
          aria-pressed={!muted}
          onClick={() => {
            setMuted(!muted);
            if (muted) window.setTimeout(() => sfx.yes(), 30);
          }}
        >
          <div className="grow">
            <div style={{ fontWeight: 800 }}>Sound effects</div>
            <div className="faint" style={{ fontSize: 13 }}>Swipes, matches and roulette bleeps (this phone only)</div>
          </div>
          <span className={`switch ${!muted ? 'on' : ''}`} />
        </button>
      </div>

      <div className="section-title">Discovery</div>
      <div className="card">
        <strong>Reset discovery memory</strong>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
          FlickPick hides titles either of you said no to, and ones you’ve both already voted on. Reset to see them again (your history stays).
        </p>
        <button
          className="btn sm"
          onClick={async () => {
            const v = await ask({
              title: 'Reset discovery',
              icon: '🔄',
              message: 'Show previously rejected titles again in future movie nights?',
              buttons: [
                { label: 'Reset', value: 'yes', variant: 'primary' },
                { label: 'Cancel', value: 'no' },
              ],
            });
            if (v !== 'yes') return;
            await api.resetDiscovery();
            qc.invalidateQueries({ queryKey: ['rails'] });
            toast('Discovery memory reset');
          }}
        >
          Reset
        </button>
      </div>

      <div className="section-title">Start fresh</div>
      <div className="card stack" style={{ gap: 14 }}>
        <div>
          <strong>Reset movie nights &amp; taste</strong>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            Clears every movie night, all swipes, and the Our Taste stats. Your watchlist and watched list stay.
          </p>
          <button className="btn sm danger" onClick={() => resetData('nights')}>Reset nights &amp; taste</button>
        </div>
        <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
          <strong>Reset everything</strong>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            Also clears the watchlist, watched list and ratings — a totally clean slate. Names, services and your TMDB key are kept.
          </p>
          <button className="btn sm danger" onClick={() => resetData('all')}>Reset everything</button>
        </div>
      </div>

      <div className="section-title">TMDB</div>
      <div className="card">
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          {boot.tmdbConfigured ? 'Connected to TMDB. ' : 'Not connected. '}Paste a new API key or read access token to replace it.
        </p>
        <div className="row">
          <input className="input grow" value={key} onChange={(e) => setKey(e.target.value)} placeholder="TMDB API key" aria-label="TMDB API key" autoComplete="off" />
          <button className="btn" disabled={!key.trim() || saving} onClick={() => save({ tmdbKey: key.trim() }, 'TMDB key updated').then(() => setKey(''))}>
            Save
          </button>
        </div>
      </div>

      <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 28 }}>
        FlickPick · This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
