import React, { useEffect, useState } from 'react';
import { Plus, History, X, Trash2 } from 'lucide-react';
import { fetchSyncLogs, fetchIntegrationConnections, createSyncLog, updateSyncLog, deleteSyncLog } from '../lib/api';

const emptyForm = {
  integration_connection_id: '', sync_started_at: '', sync_completed_at: '', status: 'success',
  records_processed: '', records_failed: '', error_summary: '',
};

function StatusBadge({ status }) {
  const cls = status === 'success' ? 'badge-good' : status === 'partial' ? 'badge-warn' : 'badge-bad';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function toLocalInput(iso) {
  if (!iso) return '';
  return iso.slice(0, 16);
}

export default function SyncLogs({ org }) {
  const [rows, setRows] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [l, c] = await Promise.all([fetchSyncLogs(org.id), fetchIntegrationConnections(org.id)]);
      setRows(l);
      setConnections(c);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    const now = new Date().toISOString().slice(0, 16);
    setForm({ ...emptyForm, integration_connection_id: connections[0]?.id || '', sync_started_at: now });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      integration_connection_id: row.integration_connection_id,
      sync_started_at: toLocalInput(row.sync_started_at),
      sync_completed_at: toLocalInput(row.sync_completed_at),
      status: row.status,
      records_processed: row.records_processed ?? '',
      records_failed: row.records_failed ?? '',
      error_summary: row.error_summary || '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.integration_connection_id) { setError('An integration connection is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        integration_connection_id: form.integration_connection_id,
        sync_started_at: form.sync_started_at ? new Date(form.sync_started_at).toISOString() : null,
        sync_completed_at: form.sync_completed_at ? new Date(form.sync_completed_at).toISOString() : null,
        status: form.status,
        records_processed: form.records_processed === '' ? null : parseInt(form.records_processed, 10),
        records_failed: form.records_failed === '' ? null : parseInt(form.records_failed, 10),
        error_summary: form.error_summary || null,
      };
      if (editing) await updateSyncLog(editing.id, payload);
      else await createSyncLog({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this sync log?')) return;
    await deleteSyncLog(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Sync Logs</h2>
          <div className="toolbar-sub">Run history for every integration connection.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> Log sync run
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <History size={28} />
              <p>No sync runs logged yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Processed</th>
                  <th>Failed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.integration_connections?.name || '—'}</td>
                    <td>{row.sync_started_at ? row.sync_started_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.records_processed ?? '—'}</td>
                    <td>{row.records_failed ?? '—'}</td>
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
              <h3>{editing ? 'Edit sync log' : 'Log sync run'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Integration connection</label>
                  <select value={form.integration_connection_id} onChange={(e) => setForm({ ...form, integration_connection_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Started at</label>
                    <input type="datetime-local" value={form.sync_started_at} onChange={(e) => setForm({ ...form, sync_started_at: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Completed at</label>
                    <input type="datetime-local" value={form.sync_completed_at} onChange={(e) => setForm({ ...form, sync_completed_at: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="success">Success</option>
                      <option value="partial">Partial</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Records processed</label>
                    <input type="number" value={form.records_processed} onChange={(e) => setForm({ ...form, records_processed: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Records failed</label>
                    <input type="number" value={form.records_failed} onChange={(e) => setForm({ ...form, records_failed: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Error summary</label>
                  <textarea rows={3} value={form.error_summary} onChange={(e) => setForm({ ...form, error_summary: e.target.value })} />
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
