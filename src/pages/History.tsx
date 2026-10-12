import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Users } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeader } from '../components/PageHeader';
import { Poster } from '../components/Poster';
import { filterSummary } from '../components/Results';

export function History() {
  const { name } = useApp();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['sessions'], queryFn: api.sessions });
  const chosen = useQuery({
    queryKey: ['titles', 'chosen', q.data?.map((s) => s.chosenKey).join()],
    queryFn: () => api.titles(q.data!.map((s) => s.chosenKey).filter(Boolean) as string[]),
    enabled: Boolean(q.data?.some((s) => s.chosenKey)),
  });

  return (
    <div className="page">
      <PageHeader back="/" title="Movie Night History" sub="Every night you’ve swiped together." />
      {q.isLoading ? (
        <div className="center"><div className="spinner" /></div>
      ) : !q.data?.length ? (
        <div className="empty">
          <div className="emoji">🗓️</div>
          <h3>No movie nights yet</h3>
          <p>Your first one is a tap away.</p>
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => navigate('/night/new')}>Start Movie Night</button>
        </div>
      ) : (
        <div className="stack">
          {q.data.map((s) => {
            const d = new Date(s.createdAt);
            const pick = s.chosenKey ? chosen.data?.[s.chosenKey] : undefined;
            return (
              <button key={s.id} className="history-card card" onClick={() => navigate(`/night/${s.id}`)}>
                <div className="row between">
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                    <div className="faint row" style={{ fontSize: 12, gap: 6 }}>
                      {s.mode === 'duo' ? <Users size={13} /> : <Smartphone size={13} />}
                      {s.mode === 'duo' ? 'Two phones' : 'Pass & play'} · {s.deckSize} titles
                    </div>
                  </div>
                  {s.status === 'swiping' ? (
                    <span className="tag" style={{ background: 'rgba(242,180,90,.18)', color: 'var(--gold)' }}>In progress</span>
                  ) : (
                    <span className="tag">💚 {s.perfectKeys.length} · 🤔 {s.possibleKeys.length}</span>
                  )}
                </div>
                <div className="history-posters">
                  {s.posterPreview.map((p, i) => (
                    <Poster key={i} title={{ poster: p, title: '' }} size="w185" />
                  ))}
                </div>
                <div className="chips" style={{ gap: 6 }}>
                  {filterSummary(s).slice(0, 5).map((x) => <span key={x} className="tag">{x}</span>)}
                </div>
                {s.status === 'swiping' && (
                  <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
                    {name(1)} {s.progress[1].done}/{s.progress[1].total} · {name(2)} {s.progress[2].done}/{s.progress[2].total}
                  </div>
                )}
                {s.chosenKey && (
                  <div className="row" style={{ marginTop: 10, gap: 8, fontSize: 13 }}>
                    <span>🍿</span>
                    <span className="muted">Picked</span>
                    <strong className="ellipsis">{pick?.title ?? '…'}</strong>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
