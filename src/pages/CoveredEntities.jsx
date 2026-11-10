import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck, X, Trash2 } from 'lucide-react';
import { fetchCoveredEntities, createCoveredEntity, updateCoveredEntity, deleteCoveredEntity } from '../lib/api';

const ENTITY_TYPES = [
  ['drug_discount_program', '340B Drug Discount Program'],
  ['fqhc', 'FQHC'],
  ['ryan_white', 'Ryan White'],
  ['hospital', 'Hospital'],
  ['std_clinic', 'STD Clinic'],
  ['other', 'Other'],
];

function StatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-good' : status === 'terminated' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

const emptyForm = {
  entity_type: 'fqhc',
  opais_id: '',
  registration_number: '',
  recertification_date: '',
  medicaid_billing_method: '',
  status: 'pending_recert',
};

export default function CoveredEntities({ org }) {
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
      setRows(await fetchCoveredEntities(org.id));
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
      entity_type: row.entity_type,
      opais_id: row.opais_id || '',
      registration_number: row.registration_number || '',
      recertification_date: row.recertification_date || '',
      medicaid_billing_method: row.medicaid_billing_method || '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        opais_id: form.opais_id || null,
        registration_number: form.registration_number || null,
        recertification_date: form.recertification_date || null,
        medicaid_billing_method: form.medicaid_billing_method || null,
      };
      if (editing) {
        await updateCoveredEntity(editing.id, payload);
      } else {
        await createCoveredEntity({ ...payload, org_id: org.id });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete ${row.entity_type.replace('_', ' ')} covered entity? This cannot be undone.`)) return;
    await deleteCoveredEntity(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Covered Entities</h2>
          <div className="toolbar-sub">One record per 340B covered entity under {org.name}.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New covered entity
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <ShieldCheck size={28} />
              <p>No covered entities yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>OPAIS ID</th>
                  <th>Medicaid billing</th>
                  <th>Recertification</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{ENTITY_TYPES.find((t) => t[0] === row.entity_type)?.[1] || row.entity_type}</td>
                    <td>{row.opais_id || '—'}</td>
                    <td>{row.medicaid_billing_method ? row.medicaid_billing_method.replace('_', '-') : '—'}</td>
                    <td>{row.recertification_date || '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
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
              <h3>{editing ? 'Edit covered entity' : 'New covered entity'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Entity type</label>
                  <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })}>
                    {ENTITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>OPAIS ID</label>
                  <input value={form.opais_id} onChange={(e) => setForm({ ...form, opais_id: e.target.value })} />
                </div>
                <div className="field">
                  <label>Registration number</label>
                  <input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
                </div>
                <div className="field">
                  <label>Medicaid billing method</label>
                  <select value={form.medicaid_billing_method} onChange={(e) => setForm({ ...form, medicaid_billing_method: e.target.value })}>
                    <option value="">Not set</option>
                    <option value="carve_in">Carve-in</option>
                    <option value="carve_out">Carve-out</option>
                  </select>
                </div>
                <div className="field">
                  <label>Recertification date</label>
                  <input type="date" value={form.recertification_date} onChange={(e) => setForm({ ...form, recertification_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="pending_recert">Pending recertification</option>
                    <option value="active">Active</option>
                    <option value="terminated">Terminated</option>
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
