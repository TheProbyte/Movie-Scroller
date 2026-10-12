import { Star } from 'lucide-react';

/** 0.5–5 stars. Tap the left half of a star for a half rating; tap the current value to clear. */
export function StarRating({ value, onChange, size = 26, color = 'var(--accent)' }: { value: number | null | undefined; onChange?: (v: number | null) => void; size?: number; color?: string }) {
  const v = value ?? 0;
  return (
    <div className="row" style={{ gap: 2 }} role={onChange ? 'slider' : 'img'} aria-label={`${v} out of 5 stars`} aria-valuenow={v} aria-valuemin={0} aria-valuemax={5}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = v >= i ? 1 : v >= i - 0.5 ? 0.5 : 0;
        return (
          <button
            key={i}
            type="button"
            disabled={!onChange}
            style={{ position: 'relative', width: size, height: size, cursor: onChange ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (!onChange) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const next = e.clientX - r.left < r.width / 2 ? i - 0.5 : i;
              onChange(next === v ? null : next);
            }}
          >
            <Star size={size} strokeWidth={1.5} color="rgba(255,255,255,0.25)" style={{ position: 'absolute', inset: 0 }} />
            {fill > 0 && (
              <span style={{ position: 'absolute', inset: 0, width: `${fill * 100}%`, overflow: 'hidden' }}>
                <Star size={size} strokeWidth={1.5} color={color} fill={color} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
