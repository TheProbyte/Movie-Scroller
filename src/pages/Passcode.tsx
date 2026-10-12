import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setToken } from '../api';

export function Passcode() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { token } = await api.auth(code);
      setToken(token);
      qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="page no-tabs center" style={{ minHeight: '100dvh' }} onSubmit={submit}>
      <div style={{ fontSize: 48 }}>🍿</div>
      <h1 className="chrome" style={{ fontSize: 38 }}>FlickPick</h1>
      <p className="muted">Enter your household passcode</p>
      <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus style={{ maxWidth: 300, textAlign: 'center' }} aria-label="Passcode" />
      {error && <p style={{ color: 'var(--no)' }}>{error}</p>}
      <button className="btn primary lg" style={{ minWidth: 200 }} disabled={!code}>Unlock</button>
    </form>
  );
}
