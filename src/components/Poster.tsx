import { useState } from 'react';
import { useApp } from '../context';
import type { Title } from '../../shared/types';

export function Poster({ title, size = 'w342', className = '', eager = false }: { title: Pick<Title, 'poster' | 'title'> | undefined; size?: 'w185' | 'w342' | 'w500' | 'w780'; className?: string; eager?: boolean }) {
  const { img } = useApp();
  const [failed, setFailed] = useState(false);
  const src = img(title?.poster, size);
  return (
    <div className={`poster ${className}`}>
      {src && !failed ? (
        <img src={src} alt={title?.title ?? ''} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <div className="fallback">{title?.title ?? ''}</div>
      )}
    </div>
  );
}

export function PosterTile({ title, onClick, badge, sub }: { title: Title | undefined; onClick?: () => void; badge?: React.ReactNode; sub?: React.ReactNode }) {
  if (!title) return <div className="poster skeleton" />;
  return (
    <button className="tile" onClick={onClick} style={{ textAlign: 'left', position: 'relative' }}>
      <Poster title={title} />
      {badge && <div style={{ position: 'absolute', top: 6, left: 6, right: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{badge}</div>}
      <div className="tile-title">{title.title}</div>
      <div className="tile-sub">{sub ?? [title.year, title.type === 'tv' ? 'Series' : null].filter(Boolean).join(' · ')}</div>
    </button>
  );
}

export function formatRuntime(t: Pick<Title, 'runtime' | 'type' | 'seasons'>) {
  if (t.type === 'tv') {
    if (t.seasons) return `${t.seasons} season${t.seasons === 1 ? '' : 's'}`;
    return t.runtime ? `${t.runtime}m eps` : null;
  }
  if (!t.runtime) return null;
  const h = Math.floor(t.runtime / 60);
  const m = t.runtime % 60;
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
}

export function Ambient({ path }: { path: string | null | undefined }) {
  const { img } = useApp();
  const src = img(path, 'w342');
  if (!src) return null;
  return (
    <div className="ambient" aria-hidden>
      <img src={src} alt="" />
    </div>
  );
}
