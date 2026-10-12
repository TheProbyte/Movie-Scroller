import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { useApp } from '../context';
import { Poster } from '../components/Poster';
import type { PlayerId, TasteStats } from '../../shared/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function verdict(a: number) {
  if (a >= 0.85) return 'Practically one brain';
  if (a >= 0.7) return 'A seriously good match';
  if (a >= 0.55) return 'Mostly on the same page';
  if (a >= 0.4) return 'Opposites attract';
  return 'Delightfully different';
}

export function Taste() {
  const { name, openTitle } = useApp();
  const q = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const s = q.data;

  if (q.isLoading) return <div className="page center"><div className="spinner" /></div>;
  if (!s || s.sharedVotes === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Our Taste</h1>
        <div className="empty">
          <div className="emoji">✨</div>
          <h3>Your taste profile is waiting</h3>
          <p>Finish a movie night together and we’ll start comparing your picks. The more you swipe, the more fun this gets.</p>
          <Link to="/night/new" className="btn primary" style={{ marginTop: 8 }}>Start Movie Night</Link>
        </div>
      </div>
    );
  }

  const ranked = s.genres.filter((g) => g.votes >= 3);
  const best = [...ranked].sort((a, b) => b.agreement - a.agreement).slice(0, 3);
  const worst = [...ranked].sort((a, b) => a.agreement - b.agreement).filter((g) => !best.includes(g)).slice(0, 3);
  const compare = s.genres.slice(0, 7);

  return (
    <div className="page taste">
      <h1 className="page-title">Our Taste</h1>
      <p className="page-sub">Based on {s.sharedVotes} titles you’ve both voted on.</p>

      <div className="taste-hero card">
        <Ring value={s.agreement} />
        <div className="grow">
          <div className="eyebrow" style={{ margin: 0 }}>You agree on</div>
          <div className="display" style={{ fontSize: 46, lineHeight: 1 }}>{pct(s.agreement)}</div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{verdict(s.agreement)}</div>
          <div className="faint" style={{ fontSize: 12 }}>Same call — both in or both out</div>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Movie nights" value={s.sessions} />
        <Stat label="Perfect matches" value={s.perfectMatches} />
        <Stat label="Possible matches" value={s.possibleMatches} />
        <Stat label="Watched together" value={s.watchedTogether} />
      </div>

      <div className="section-title">Who’s pickier?</div>
      <div className="card stack" style={{ gap: 14 }}>
        {([1, 2] as PlayerId[]).map((p) => (
          <Bar key={p} player={p} label={name(p)} value={s.yesRate[p]} caption={`says yes to ${pct(s.yesRate[p])}`} />
        ))}
        <p className="faint" style={{ fontSize: 12 }}>
          {Math.abs(s.yesRate[1] - s.yesRate[2]) < 0.05
            ? 'Equally choosy. Very diplomatic.'
            : `${name(s.yesRate[1] < s.yesRate[2] ? 1 : 2)} is the tougher critic.`}
        </p>
      </div>

      <div className="section-title">Favorite genres</div>
      <div className="fav-grid">
        {([1, 2] as PlayerId[]).map((p) => (
          <div key={p} className="card">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <span className="dot" style={{ background: `var(--p${p}-mark)` }} />
              <strong>{name(p)}</strong>
            </div>
            {s.favoriteGenres[p].length ? (
              <ol className="fav-list">
                {s.favoriteGenres[p].map((g) => (
                  <li key={g.genre}>
                    <span>{g.genre}</span>
                    <span className="faint">{g.yes}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="faint" style={{ fontSize: 13 }}>No yeses yet</p>
            )}
          </div>
        ))}
      </div>

      {compare.length > 0 && <GenreCompare genres={compare} name={name} />}

      {(best.length > 0 || worst.length > 0) && (
        <div className="fav-grid" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="eyebrow" style={{ margin: '0 0 8px' }}>Where you click</div>
            {best.map((g) => (
              <div key={g.genre} className="row between" style={{ padding: '4px 0' }}>
                <span>{g.genre}</span>
                <strong>{pct(g.agreement)}</strong>
              </div>
            ))}
            {!best.length && <p className="faint" style={{ fontSize: 13 }}>Need a few more votes</p>}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ margin: '0 0 8px' }}>Where you differ</div>
            {worst.map((g) => (
              <div key={g.genre} className="row between" style={{ padding: '4px 0' }}>
                <span>{g.genre}</span>
                <strong>{pct(g.agreement)}</strong>
              </div>
            ))}
            {!worst.length && <p className="faint" style={{ fontSize: 13 }}>Need a few more votes</p>}
          </div>
        </div>
      )}

      {s.splits.length > 0 && (
        <>
          <div className="section-title">One loved it, one passed</div>
          <div className="rail">
            {s.splits.map(({ key, lover }) => {
              const t = s.titles[key];
              if (!t) return null;
              return (
                <button key={key} onClick={() => openTitle(key)} style={{ textAlign: 'left' }}>
                  <Poster title={t} size="w185" />
                  <div className="tile-title">{t.title}</div>
                  <div className="tile-sub">
                    💚 {name(lover)} · ✕ {name(lover === 1 ? 2 : 1)}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">Ratings after watching</div>
      <div className="card">
        <div className="row between">
          {([1, 2] as PlayerId[]).map((p) => (
            <div key={p} style={{ textAlign: p === 1 ? 'left' : 'right' }}>
              <div className="faint" style={{ fontSize: 12 }}>{name(p)}’s average</div>
              <div className="display" style={{ fontSize: 34 }}>{s.avgRating[p] != null ? `★ ${s.avgRating[p]}` : '—'}</div>
            </div>
          ))}
        </div>
        {s.ratingGaps.length > 0 && (
          <>
            <div className="faint" style={{ fontSize: 12, margin: '12px 0 8px' }}>Biggest disagreements</div>
            <div className="stack" style={{ gap: 8 }}>
              {s.ratingGaps.map((g) => {
                const t = s.titles[g.key];
                if (!t) return null;
                return (
                  <button key={g.key} className="row" style={{ gap: 12, textAlign: 'left' }} onClick={() => openTitle(g.key)}>
                    <Poster title={t} size="w185" className="mini-poster" />
                    <span className="grow ellipsis" style={{ fontWeight: 600 }}>{t.title}</span>
                    <span style={{ fontSize: 13 }}>★ {g.ratings[1]} vs ★ {g.ratings[2]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`Agreement ${pct(value)}`}>
      <circle cx="52" cy="52" r={r} fill="none" stroke="#0a1040" strokeWidth="9" />
      <motion.circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value) }}
        transition={{ duration: 1.2, ease: [0.2, 0.7, 0.3, 1] }}
        transform="rotate(-90 52 52)"
      />
      <text x="52" y="60" textAnchor="middle" fontSize="26">💞</text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat card">
      <div className="display" style={{ fontSize: 34, lineHeight: 1 }}>{value}</div>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Bar({ player, label, value, caption }: { player: PlayerId; label: string; value: number; caption: string }) {
  return (
    <div title={`${label}: ${caption}`}>
      <div className="row between" style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">{caption}</span>
      </div>
      <div className="bar-track">
        <motion.div className="bar-fill" style={{ background: `var(--p${player}-mark)` }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, value * 100)}%` }} transition={{ duration: 0.9 }} />
      </div>
    </div>
  );
}

function GenreCompare({ genres, name }: { genres: TasteStats['genres']; name: (p: PlayerId) => string }) {
  return (
    <>
      <div className="section-title">Genre enthusiasm</div>
      <div className="card">
        <div className="row" style={{ gap: 14, fontSize: 12, marginBottom: 12 }}>
          {([1, 2] as PlayerId[]).map((p) => (
            <span key={p} className="row" style={{ gap: 6 }}>
              <span className="legend-swatch" style={{ background: `var(--p${p}-mark)` }} />
              {name(p)}
            </span>
          ))}
          <span className="faint" style={{ marginLeft: 'auto' }}>% keen · agree</span>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          {genres.map((g) => (
            <div key={g.genre} className="genre-row">
              <div className="row between" style={{ fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{g.genre}</span>
                <span className="faint">{pct(g.agreement)} agree · {g.votes} titles</span>
              </div>
              {([1, 2] as PlayerId[]).map((p) => (
                <div key={p} className="genre-bar" title={`${name(p)} — ${pct(g.yesRate[p])} keen on ${g.genre}`}>
                  <div className="bar-track thin">
                    <motion.div className="bar-fill" style={{ background: `var(--p${p}-mark)` }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, g.yesRate[p] * 100)}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <span className="genre-val">{pct(g.yesRate[p])}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="faint" style={{ fontSize: 11, marginTop: 6 }}>Keen = yes counts fully, maybe counts half.</p>
    </>
  );
}
