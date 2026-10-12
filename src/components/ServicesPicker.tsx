import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useApp } from '../context';

/** Grid of streaming-service logos for the household region. */
export function ServicesPicker({ region, value, onChange }: { region: string; value: number[]; onChange: (ids: number[]) => void }) {
  const { img } = useApp();
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ['providers', region], queryFn: () => api.providers(region), staleTime: Infinity });
  if (q.isLoading) return <div className="center" style={{ minHeight: 120 }}><div className="spinner" /></div>;
  if (q.isError) return <p className="muted">{(q.error as Error).message}</p>;
  const list = q.data ?? [];
  const selected = new Set(value);
  // Always show selected ones, plus the most popular in the region.
  const shown = all ? list : list.filter((p, i) => i < 18 || selected.has(p.id));
  return (
    <>
      <div className="svc-grid">
        {shown.map((p) => (
          <button
            key={p.id}
            className={`svc ${selected.has(p.id) ? 'on' : ''}`}
            onClick={() => onChange(selected.has(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}
            aria-pressed={selected.has(p.id)}
          >
            {p.logo ? <img src={img(p.logo, 'w92')!} alt="" /> : <span className="svc-fallback">{p.name[0]}</span>}
            <span className="svc-name">{p.name}</span>
          </button>
        ))}
      </div>
      {list.length > shown.length && (
        <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setAll(true)}>
          Show all {list.length} services
        </button>
      )}
    </>
  );
}
