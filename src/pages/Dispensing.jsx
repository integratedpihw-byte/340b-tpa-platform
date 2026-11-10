import React, { useEffect, useState } from 'react';
import { Plus, PackageCheck, X, Trash2 } from 'lucide-react';
import { fetchDispensingRecords, fetchPrescriptions, fetchFacilities, createDispensingRecord, updateDispensingRecord, deleteDispensingRecord } from '../lib/api';

const emptyForm = {
  prescription_id: '', facility_id: '', ndc: '', quantity_dispensed: '', lot_number: '',
  pricing_tier: '340b', reconciliation_status: 'unreconciled',
};

function ReconBadge({ status }) {
  const cls = status === 'matched' ? 'badge-good' : status === 'exception' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function Dispensing({ org }) {
  const [rows, setRows] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
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
      const [d, p, f] = await Promise.all([fetchDispensingRecords(org.id), fetchPrescriptions(org.id), fetchFacilities(org.id)]);
      setRows(d);
      setPrescriptions(p);
      setFacilities(f.filter((x) => x.facility_type === 'contract_pharmacy' || x.facility_type === 'clinic'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, prescription_id: prescriptions[0]?.id || '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      prescription_id: row.prescription_id,
      facility_id: row.facility_id || '',
      ndc: row.ndc || '',
      quantity_dispensed: row.quantity_dispensed ?? '',
      lot_number: row.lot_number || '',
      pricing_tier: row.pricing_tier || '340b',
      reconciliation_status: row.reconciliation_status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.prescription_id) { setError('Create a prescription first — every fill traces back to one.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        facility_id: form.facility_id || null,
        quantity_dispensed: form.quantity_dispensed === '' ? null : Number(form.quantity_dispensed),
      };
      if (editing) await updateDispensingRecord(editing.id, payload);
      else await createDispensingRecord({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this dispensing record?')) return;
    await deleteDispensingRecord(row.id);
    await load();
  }

  function rxLabel(id) {
    const rx = prescriptions.find((p) => p.id === id);
    return rx ? `${rx.drug_name}${rx.patient_ref ? ' · ' + rx.patient_ref : ''}` : '—';
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Dispensing</h2>
          <div className="toolbar-sub">Pharmacy fills, reconciled against purchasing and prescriptions.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New dispensing record
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <PackageCheck size={28} />
              <p>No dispensing records yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Prescription</th>
                  <th>Qty dispensed</th>
                  <th>Pricing tier</th>
                  <th>Reconciliation</th>
                  <th>Dispensed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.prescriptions?.drug_name || rxLabel(row.prescription_id)}</td>
                    <td>{row.quantity_dispensed ?? '—'}</td>
                    <td>{row.pricing_tier || '—'}</td>
                    <td><ReconBadge status={row.reconciliation_status} /></td>
                    <td>{new Date(row.dispensed_at).toLocaleDateString()}</td>
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
              <h3>{editing ? 'Edit dispensing record' : 'New dispensing record'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Prescription</label>
                  <select value={form.prescription_id} onChange={(e) => setForm({ ...form, prescription_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {prescriptions.map((rx) => <option key={rx.id} value={rx.id}>{rx.drug_name}{rx.patient_ref ? ` · ${rx.patient_ref}` : ''}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Dispensing facility</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>NDC</label>
                    <input value={form.ndc} onChange={(e) => setForm({ ...form, ndc: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Quantity dispensed</label>
                    <input type="number" step="any" value={form.quantity_dispensed} onChange={(e) => setForm({ ...form, quantity_dispensed: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Lot number</label>
                  <input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Pricing tier</label>
                    <select value={form.pricing_tier} onChange={(e) => setForm({ ...form, pricing_tier: e.target.value })}>
                      <option value="340b">340B</option>
                      <option value="wac">WAC</option>
                      <option value="gpo">GPO</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Reconciliation status</label>
                    <select value={form.reconciliation_status} onChange={(e) => setForm({ ...form, reconciliation_status: e.target.value })}>
                      <option value="unreconciled">Unreconciled</option>
                      <option value="matched">Matched</option>
                      <option value="exception">Exception</option>
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
