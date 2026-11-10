import React, { useEffect, useState } from 'react';
import { Plus, Plug, X, Trash2 } from 'lucide-react';
import { fetchIntegrationConnections, createIntegrationConnection, updateIntegrationConnection, deleteIntegrationConnection } from '../lib/api';

const CONNECTION_TYPES = ['ehr', 'pharmacy_pos', 'wholesaler_edi', 'medicaid_portal', 'medicare_portal', 'sso_provider', 'other'];

const emptyForm = { connection_type: 'ehr', name: '', status: 'pending_setup', config: '' };

function StatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-good' : status === 'error' ? 'badge-bad' : status === 'inactive' ? 'badge-neutral' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

export default function IntegrationConnections({ org }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchIntegrationConnections(org.id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      connection_type: row.connection_type,
      name: row.name,
      status: row.status,
      config: row.config ? JSON.stringify(row.config, null, 2) : '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { setError('A name is required.'); return; }
    setBusy(true);
    setError('');
    try {
      let config = null;
      if (form.config.trim()) {
        try { config = JSON.parse(form.config); }
        catch { setError('Config must be valid JSON, or left blank. Never put API keys or secrets here.'); setBusy(false); return; }
      }
      const payload = { connection_type: form.connection_type, name: form.name, status: form.status, config };
      if (editing) await updateIntegrationConnection(editing.id, payload);
      else await createIntegrationConnection({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this integration connection? Its sync logs will be deleted too.')) return;
    await deleteIntegrationConnection(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Integration Connections</h2>
          <div className="toolbar-sub">EHR, pharmacy POS, wholesaler, payer-portal, and SSO connections. Config here is non-secret only — keys and secrets live in encrypted environment storage.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New connection
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Plug size={28} />
              <p>No integration connections yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last sync</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td>{row.connection_type.replace(/_/g, ' ')}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.last_sync_at ? row.last_sync_at.slice(0, 10) : '—'}</td>
                    <td className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit connection' : 'New integration connection'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Epic EHR — Main Clinic" />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Connection type</label>
                    <select value={form.connection_type} onChange={(e) => setForm({ ...form, connection_type: e.target.value })}>
                      {CONNECTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="pending_setup">Pending setup</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Config (JSON, non-secret only — no API keys or passwords)</label>
                  <textarea rows={5} value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} placeholder='{"endpoint": "https://...", "sync_schedule": "0 */6 * * *"}' />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
