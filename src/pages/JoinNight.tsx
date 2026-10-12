import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeader } from '../components/PageHeader';

export function JoinNight() {
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase().slice(0, 4));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { me } = useApp();
  const input = useRef<HTMLInputElement>(null);

  const join = async (c = code) => {
    if (c.length < 4) return;
    setBusy(true);
    setError('');
    try {
      const { id } = await api.sessionByCode(c);
      navigate(`/night/${id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (code.length === 4 && params.get('code') && me) join(code);
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <div className="page no-tabs">
      <PageHeader back="/" title="Join a movie night" sub="Enter the 4-letter code from your partner’s phone." />
      <label className="code-input" onClick={() => input.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`code-slot ${code.length === i ? 'active' : ''}`}>{code[i] ?? ''}</span>
        ))}
        <input
          ref={input}
          value={code}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Room code"
          maxLength={4}
          onChange={(e) => {
            const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
            setCode(v);
            setError('');
            if (v.length === 4) join(v);
          }}
        />
      </label>
      {error && <p style={{ color: 'var(--no)', textAlign: 'center', marginTop: 14 }}>{error}</p>}
      <button className="btn primary lg block" style={{ marginTop: 28 }} disabled={code.length < 4 || busy} onClick={() => join()}>
        {busy ? 'Joining…' : 'Join'}
      </button>
    </div>
  );
}
