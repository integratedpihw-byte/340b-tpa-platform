import React, { useEffect, useState } from 'react';
import { Plus, GitCompare, X, Trash2 } from 'lucide-react';
import { fetchPayerReconciliations, fetchCoveredEntities, createPayerReconciliation, updatePayerReconciliation, deletePayerReconciliation } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', payer_type: 'medicaid', period_start: '', period_end: '',
  total_claims: '', matched_claims: '', exception_count: '', status: 'in_progress',
};

export default function PayerReconciliations({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([fetchPayerReconciliations(org.id), fetchCoveredEntities(org.id)]);
      setRows(r);
      setEntities(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id,
      payer_type: row.payer_type,
      period_start: row.period_start || '',
      period_end: row.period_end || '',
      total_claims: row.total_claims ?? '',
      matched_claims: row.matched_claims ?? '',
      exception_count: row.exception_count ?? '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id) { setError('Select a covered entity first.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        total_claims: form.total_claims === '' ? 0 : Number(form.total_claims),
        matched_claims: form.matched_claims === '' ? 0 : Number(form.matched_claims),
        exception_count: form.exception_count === '' ? 0 : Number(form.exception_count),
        completed_at: form.status === 'completed' ? new Date().toISOString() : (editing?.completed_at || null),
      };
      if (editing) await updatePayerReconciliation(editing.id, payload);
      else await createPayerReconciliation({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this reconciliation run?')) return;
    await deletePayerReconciliation(row.id);
    await load();
  }

  function entityLabel(id) {
    const e = entities.find((x) => x.id === id);
    return e ? (e.opais_id || e.entity_type.replace('_', ' ')) : '—';
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Payer Reconciliations</h2>
          <div className="toolbar-sub">Claims reconciliation runs by period, Medicaid or Medicare.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New reconciliation
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <GitCompare size={28} />
              <p>No reconciliation runs yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Covered entity</th>
                  <th>Payer</th>
                  <th>Period</th>
                  <th>Claims</th>
                  <th>Exceptions</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{entityLabel(row.covered_entity_id)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{row.payer_type}</td>
                    <td>{row.period_start || '—'} → {row.period_end || '—'}</td>
                    <td>{row.matched_claims}/{row.total_claims} matched</td>
                    <td>{row.exception_count > 0 ? <span className="badge badge-warn">{row.exception_count}</span> : <span className="badge badge-neutral">0</span>}</td>
                    <td><span className={`badge ${row.status === 'completed' ? 'badge-good' : 'badge-warn'}`}>{row.status.replace('_', ' ')}</span></td>
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
              <h3>{editing ? 'Edit reconciliation' : 'New reconciliation'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Covered entity</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.opais_id || ent.entity_type.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Payer</label>
                  <select value={form.payer_type} onChange={(e) => setForm({ ...form, payer_type: e.target.value })}>
                    <option value="medicaid">Medicaid</option>
                    <option value="medicare">Medicare</option>
                    <option value="commercial">Commercial</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Period start</label>
                    <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Period end</label>
                    <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Total claims</label>
                    <input type="number" value={form.total_claims} onChange={(e) => setForm({ ...form, total_claims: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Matched claims</label>
                    <input type="number" value={form.matched_claims} onChange={(e) => setForm({ ...form, matched_claims: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Exceptions</label>
                    <input type="number" value={form.exception_count} onChange={(e) => setForm({ ...form, exception_count: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
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
