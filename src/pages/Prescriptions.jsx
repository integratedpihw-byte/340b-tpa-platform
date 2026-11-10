import React, { useEffect, useState } from 'react';
import { Plus, FileText, X, Trash2 } from 'lucide-react';
import { fetchPrescriptions, fetchCoveredEntities, fetchFacilities, createPrescription, updatePrescription, deletePrescription } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', facility_id: '', patient_ref: '', ndc: '', drug_name: '',
  prescriber_npi: '', quantity: '', eligibility_status: 'pending_review', status: 'prescribed',
};

function EligBadge({ status }) {
  const cls = status === 'eligible' ? 'badge-good' : status === 'ineligible' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

export default function Prescriptions({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [p, e, f] = await Promise.all([fetchPrescriptions(org.id), fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      setRows(p);
      setEntities(e);
      setFacilities(f);
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
      facility_id: row.facility_id || '',
      patient_ref: row.patient_ref || '',
      ndc: row.ndc || '',
      drug_name: row.drug_name,
      prescriber_npi: row.prescriber_npi || '',
      quantity: row.quantity ?? '',
      eligibility_status: row.eligibility_status,
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
        facility_id: form.facility_id || null,
        quantity: form.quantity === '' ? null : Number(form.quantity),
      };
      if (editing) await updatePrescription(editing.id, payload);
      else await createPrescription({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete this prescription for ${row.drug_name}?`)) return;
    await deletePrescription(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Prescriptions</h2>
          <div className="toolbar-sub">The spine record every dispensing fill traces back to.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New prescription
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <FileText size={28} />
              <p>No prescriptions yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>NDC</th>
                  <th>Prescriber NPI</th>
                  <th>Qty</th>
                  <th>Eligibility</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.drug_name}</td>
                    <td>{row.ndc || '—'}</td>
                    <td>{row.prescriber_npi || '—'}</td>
                    <td>{row.quantity ?? '—'}</td>
                    <td><EligBadge status={row.eligibility_status} /></td>
                    <td><span className="badge badge-neutral">{row.status}</span></td>
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
              <h3>{editing ? 'Edit prescription' : 'New prescription'}</h3>
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
                  <label>Prescribing facility</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Drug name</label>
                    <input required value={form.drug_name} onChange={(e) => setForm({ ...form, drug_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>NDC</label>
                    <input value={form.ndc} onChange={(e) => setForm({ ...form, ndc: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Prescriber NPI</label>
                    <input value={form.prescriber_npi} onChange={(e) => setForm({ ...form, prescriber_npi: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Quantity</label>
                    <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Patient reference (internal only — no name/DOB)</label>
                  <input value={form.patient_ref} onChange={(e) => setForm({ ...form, patient_ref: e.target.value })} placeholder="e.g. internal MRN or case number" />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Eligibility</label>
                    <select value={form.eligibility_status} onChange={(e) => setForm({ ...form, eligibility_status: e.target.value })}>
                      <option value="pending_review">Pending review</option>
                      <option value="eligible">Eligible</option>
                      <option value="ineligible">Ineligible</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="prescribed">Prescribed</option>
                      <option value="dispensed">Dispensed</option>
                      <option value="reversed">Reversed</option>
                      <option value="void">Void</option>
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
