import React, { useEffect, useState } from 'react';
import { Plus, Landmark, X, Trash2 } from 'lucide-react';
import { fetchMedicaidEnrollments, fetchCoveredEntities, createMedicaidEnrollment, updateMedicaidEnrollment, deleteMedicaidEnrollment } from '../lib/api';

const emptyForm = { covered_entity_id: '', state: '', medicaid_provider_number: '', mef_match_status: 'not_applicable', effective_date: '', status: 'active' };

function MefBadge({ status }) {
  const cls = status === 'matched' ? 'badge-good' : status === 'unmatched' ? 'badge-bad' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

export default function MedicaidEnrollments({ org }) {
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
      const [m, e] = await Promise.all([fetchMedicaidEnrollments(org.id), fetchCoveredEntities(org.id)]);
      setRows(m);
      setEntities(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    const first = entities[0];
    setForm({ ...emptyForm, covered_entity_id: first?.id || '', mef_match_status: first?.medicaid_billing_method === 'carve_in' ? 'not_applicable' : 'unmatched' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id,
      state: row.state || '',
      medicaid_provider_number: row.medicaid_provider_number || '',
      mef_match_status: row.mef_match_status,
      effective_date: row.effective_date || '',
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
      const payload = { ...form, effective_date: form.effective_date || null };
      if (editing) await updateMedicaidEnrollment(editing.id, payload);
      else await createMedicaidEnrollment({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this Medicaid enrollment?')) return;
    await deleteMedicaidEnrollment(row.id);
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
          <h2>Medicaid Enrollments</h2>
          <div className="toolbar-sub">The Medicaid Exclusion File (MEF) governs fee-for-service only — managed care uses separate controls.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New enrollment
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Landmark size={28} />
              <p>No Medicaid enrollments yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Covered entity</th>
                  <th>State</th>
                  <th>Provider #</th>
                  <th>MEF status</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{entityLabel(row.covered_entity_id)}</td>
                    <td>{row.state || '—'}</td>
                    <td>{row.medicaid_provider_number || '—'}</td>
                    <td><MefBadge status={row.mef_match_status} /></td>
                    <td><span className={`badge ${row.status === 'active' ? 'badge-good' : 'badge-neutral'}`}>{row.status}</span></td>
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
              <h3>{editing ? 'Edit enrollment' : 'New Medicaid enrollment'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Covered entity</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.opais_id || ent.entity_type.replace('_', ' ')} ({ent.medicaid_billing_method || 'billing method not set'})</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>State</label>
                    <input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="e.g. NY" />
                  </div>
                  <div className="field">
                    <label>Medicaid provider number</label>
                    <input value={form.medicaid_provider_number} onChange={(e) => setForm({ ...form, medicaid_provider_number: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>MEF match status</label>
                  <select value={form.mef_match_status} onChange={(e) => setForm({ ...form, mef_match_status: e.target.value })}>
                    <option value="not_applicable">Not applicable (managed care / MCO)</option>
                    <option value="matched">Matched (FFS, in the MEF)</option>
                    <option value="unmatched">Unmatched (FFS, needs review)</option>
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Effective date</label>
                    <input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
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
