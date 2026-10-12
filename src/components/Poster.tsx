import { memo, useState } from 'react';
import { useApp } from '../context';
import type { Title } from '../../shared/types';

type PosterTitle = Pick<Title, 'poster' | 'title'> & Partial<Pick<Title, 'type' | 'seasons'>>;

/**
 * Every poster is shown as a DVD keepcase: plastic shell, spine ridges and a
 * sheen (all CSS), with the poster as the cover art. `band` adds the label
 * strip across the top, like a real cover.
 */
export const Poster = memo(function Poster({
  title,
  size = 'w342',
  className = '',
  eager = false,
  band = false,
}: {
  title: PosterTitle | undefined;
  size?: 'w185' | 'w342' | 'w500' | 'w780';
  className?: string;
  eager?: boolean;
  band?: boolean;
}) {
  const { img } = useApp();
  const [failed, setFailed] = useState(false);
  const src = img(title?.poster, size);
  return (
    <div className={`poster dvd ${className}`}>
      <div className="dvd-art">
        {src && !failed ? (
          <img src={src} alt={title?.title ?? ''} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} draggable={false} />
        ) : (
          <div className="fallback">{title?.title ?? ''}</div>
        )}
        {band && <DvdBand title={title} />}
      </div>
    </div>
  );
});

export function DvdBand({ title }: { title: PosterTitle | undefined }) {
  const label = title?.type === 'tv' ? (title.seasons ? `${title.seasons}-SEASON BOX SET` : 'TV SERIES') : 'WIDESCREEN';
  return (
    <div className="dvd-band">
      <span className="dvd-band-logo">DVD</span>
      <span className="dvd-band-label">{label}</span>
    </div>
  );
}

export function PosterTile({ title, onClick, badge, sub }: { title: Title | undefined; onClick?: () => void; badge?: React.ReactNode; sub?: React.ReactNode }) {
  if (!title) return <div className="poster dvd skeleton" />;
  return (
    <button className="tile" onClick={onClick} style={{ textAlign: 'left', position: 'relative' }}>
      <Poster title={title} />
      {badge && <div className="tile-badges">{badge}</div>}
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

/** Starburst sticker, like the "NEW!" price stickers on video store shelves. */
export function Starburst({ children, tone = 'gold', className = '' }: { children: React.ReactNode; tone?: 'gold' | 'pink' | 'lime'; className?: string }) {
  return (
    <span className={`starburst starburst-${tone} ${className}`}>
      <span>{children}</span>
    </span>
  );
}
