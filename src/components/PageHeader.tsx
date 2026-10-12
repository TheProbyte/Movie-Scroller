import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate();
  return (
    <button
      className="icon-btn"
      aria-label="Back"
      onClick={() => (to ? navigate(to) : window.history.length > 1 ? navigate(-1) : navigate('/'))}
    >
      <ChevronLeft size={22} />
    </button>
  );
}

export function PageHeader({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: boolean | string; right?: ReactNode }) {
  return (
    <>
      {(back || right) && (
        <div className="page-header" style={{ marginBottom: 10 }}>
          {back ? <BackButton to={typeof back === 'string' ? back : undefined} /> : <span />}
          <div className="row">{right}</div>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
    </>
  );
}
