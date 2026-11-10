import React, { useState } from 'react';
import { Hourglass, Ban } from 'lucide-react';
import { signOut } from '../lib/api';

export default function PendingAccess({ status, onRefresh }) {
  const [checking, setChecking] = useState(false);
  const disabled = status === 'disabled';

  async function check() {
    setChecking(true);
    try { await onRefresh(); } finally { setChecking(false); }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-brand">
          <div className="auth-brand-mark">{disabled ? <Ban size={16} /> : <Hourglass size={16} />}</div>
          <div className="auth-brand-name">{disabled ? 'Access disabled' : 'Waiting for approval'}</div>
        </div>
        <p className="sub">
          {disabled
            ? 'Your access to this organization has been disabled. Contact your organization admin if you think this is a mistake.'
            : 'Your request to join has been sent. An admin of the organization needs to approve it and assign you a role before you can see anything.'}
        </p>
        {!disabled && (
          <button className="btn btn-primary" type="button" onClick={check} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        )}
        <button className="btn btn-secondary" type="button" style={{ marginTop: 10 }} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
