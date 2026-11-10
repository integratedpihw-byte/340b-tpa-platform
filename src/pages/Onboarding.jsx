import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { createOrganization, joinOrganization } from '../lib/api';

export default function Onboarding({ user, isPlatformAdmin, onDone }) {
  const [tab, setTab] = useState(isPlatformAdmin ? 'create' : 'join');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const org = await createOrganization({ name, legal_name: legalName || null, status: 'active' });
      onDone(org.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const profile = await joinOrganization(user.id, user.email, orgId.trim());
      onDone(profile.org_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-brand">
          <div className="auth-brand-mark"><Building2 size={16} /></div>
          <div className="auth-brand-name">Set up your organization</div>
        </div>
        <p className="sub">
          Every 340B client is its own isolated organization (tenant). Create one, or join one you already have
          the ID for.
        </p>

        {isPlatformAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ flex: 1, background: tab === 'create' ? 'var(--accent)' : '#fff', color: tab === 'create' ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
              onClick={() => setTab('create')}
            >
              Create organization
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ flex: 1, background: tab === 'join' ? 'var(--accent)' : '#fff', color: tab === 'join' ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
              onClick={() => setTab('join')}
            >
              Join by org ID
            </button>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {tab === 'create' ? (
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>Organization name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Community Health" />
            </div>
            <div className="field">
              <label>Legal name (optional)</label>
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal entity name, if different" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create organization'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <div className="field">
              <label>Organization ID</label>
              <input required value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="UUID shared by your org admin" />
              <div className="field-hint">Find this on the Organizations page once an admin has created your org.</div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join organization'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
