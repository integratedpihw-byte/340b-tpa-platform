import React, { useState } from 'react';
import { Plus, Building2, Copy, X } from 'lucide-react';
import { createOrganization, updateOrganization } from '../lib/api';

function StatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-good' : status === 'suspended' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function Organizations({ organizations, onRefresh, onSelect }) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tier, setTier] = useState('single_entity');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createOrganization({ name, legal_name: legalName || null, tier, status: 'active' });
      setShowNew(false);
      setName('');
      setLegalName('');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(org) {
    const next = org.status === 'active' ? 'suspended' : 'active';
    await updateOrganization(org.id, { status: next });
    await onRefresh();
  }

  function copyId(id) {
    navigator.clipboard?.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1500);
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Organizations</h2>
          <div className="toolbar-sub">Every client is its own isolated tenant.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowNew(true)}>
          <Plus size={15} /> New organization
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {organizations.length === 0 ? (
            <div className="empty-state">
              <Building2 size={28} />
              <p>No organizations yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Org ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <a href="#" onClick={(e) => { e.preventDefault(); onSelect(org.id); }} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>
                        {org.name}
                      </a>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{org.legal_name}</div>
                    </td>
                    <td>{org.tier === 'multi_entity' ? 'Multi-entity' : 'Single entity'}</td>
                    <td><StatusBadge status={org.status} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => copyId(org.id)}>
                        <Copy size={12} /> {copiedId === org.id ? 'Copied' : 'Copy ID'}
                      </button>
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleStatus(org)}>
                        {org.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New organization</h3>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Legal name (optional)</label>
                  <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Tier</label>
                  <select value={tier} onChange={(e) => setTier(e.target.value)}>
                    <option value="single_entity">Single entity</option>
                    <option value="multi_entity">Multi-entity</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
