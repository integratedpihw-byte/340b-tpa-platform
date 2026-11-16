import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IDLE_MINUTES } from '../lib/securityConfig';

export default function SecuritySettings() {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) setError(err.message);
    setFactors((data?.all || []).filter((f) => f.factor_type === 'totp'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const verified = factors.filter((f) => f.status === 'verified');

  async function startEnroll() {
    setError(''); setInfo(''); setBusy(true);
    try {
      // an abandoned, unverified attempt would block a new enrollment
      for (const f of factors.filter((x) => x.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
      if (err) throw err;
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch (err) {
      setError(err.message || 'Could not start setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: challenge.id, code: code.trim() });
      if (vErr) throw vErr;
      setEnrolling(null);
      setInfo('Two-step verification is on. You will be asked for a code each time you sign in.');
      await load();
    } catch (err) {
      setError(err.message || 'That code did not match. Try the newest code.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.id });
    setEnrolling(null);
    await load();
  }

  async function removeFactor(factorId) {
    if (!window.confirm('Turn off two-step verification? Your account will be protected by your password only.')) return;
    setError(''); setInfo(''); setBusy(true);
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) throw err;
      setInfo('Two-step verification is off.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not remove it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Security</h2>
          <div className="toolbar-sub">Protect your account. Everything here applies to you only.</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-info">{info}</div>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Two-step verification</h2>
          {verified.length > 0
            ? <span className="badge badge-good">On</span>
            : <span className="badge badge-warn">Off</span>}
        </div>
        <div className="panel-body">
          {loading ? <p>Loading…</p> : enrolling ? (
            <form onSubmit={confirmEnroll}>
              <p style={{ marginTop: 0 }}>
                1. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
              </p>
              <img src={enrolling.qr} alt="Authenticator QR code" width={170} height={170} style={{ background: '#fff', padding: 8, border: '1px solid var(--border)', borderRadius: 8 }} />
              <p className="field-hint">Cannot scan? Enter this key manually: <code>{enrolling.secret}</code></p>
              <p>2. Enter the 6-digit code the app shows.</p>
              <div className="field" style={{ maxWidth: 220 }}>
                <label htmlFor="enroll-code">Authentication code</label>
                <input id="enroll-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" style={{ width: 'auto' }} type="submit" disabled={busy || code.length !== 6}>
                  {busy ? 'Checking…' : 'Turn on'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={cancelEnroll} disabled={busy}>Cancel</button>
              </div>
            </form>
          ) : verified.length > 0 ? (
            <div>
              <p style={{ marginTop: 0 }}><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
                You are asked for a code from your authenticator app each time you sign in.</p>
              {verified.map((f) => (
                <button key={f.id} className="btn btn-danger btn-sm" onClick={() => removeFactor(f.id)} disabled={busy}>
                  Turn off
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p style={{ marginTop: 0 }}><ShieldOff size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
                Your account is protected by a password only. Two-step verification is strongly recommended for anyone who can see patient or HIV-related records.</p>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={startEnroll} disabled={busy}>Set up</button>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Automatic sign-out</h2></div>
        <div className="panel-body">
          <p style={{ margin: 0 }}>
            You are signed out after {IDLE_MINUTES} minutes without activity. A warning appears one minute before.
          </p>
        </div>
      </div>
    </div>
  );
}
