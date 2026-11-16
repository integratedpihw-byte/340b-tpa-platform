import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { signOut } from '../lib/api';

export default function MfaChallenge({ onVerified }) {
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (!active) return;
      if (err) { setError(err.message); return; }
      const factor = (data?.totp || [])[0];
      if (factor) setFactorId(factor.id);
      else setError('No authenticator is set up on this account.');
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
      if (vErr) throw vErr;
      await onVerified();
    } catch (err) {
      setError(err.message || 'That code did not work. Try the newest code from your authenticator app.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 420 }}>
        <div className="auth-brand">
          <div className="auth-brand-mark"><ShieldCheck size={16} /></div>
          <div className="auth-brand-name">Two-step verification</div>
        </div>
        <p className="sub">Enter the 6-digit code from your authenticator app to finish signing in.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="mfa-code">Authentication code</label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !factorId || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <button className="btn btn-secondary" type="button" style={{ marginTop: 10 }} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
