import React, { useEffect, useState } from 'react';
import { Plus, Handshake, X, Trash2, AlertTriangle } from 'lucide-react';
import { fetchPharmacyContracts, fetchCoveredEntities, fetchFacilities, createPharmacyContract, updatePharmacyContract, deletePharmacyContract } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', pharmacy_facility_id: '', contract_start_date: '', contract_end_date: '',
  last_internal_audit_date: '', last_independent_audit_date: '', status: 'pending',
};

function StatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-good' : status === 'terminated' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function auditOverdue(dateStr, months) {
  if (!dateStr) return true;
  const due = new Date(dateStr);
  due.setMonth(due.getMonth() + months);
  return due < new Date();
}

export default function PharmacyContracts({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [c, e, f] = await Promise.all([fetchPharmacyContracts(org.id), fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      setRows(c);
      setEntities(e);
      setPharmacies(f.filter((x) => x.facility_type === 'contract_pharmacy'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '', pharmacy_facility_id: pharmacies[0]?.id || '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id,
      pharmacy_facility_id: row.pharmacy_facility_id,
      contract_start_date: row.contract_start_date || '',
      contract_end_date: row.contract_end_date || '',
      last_internal_audit_date: row.last_internal_audit_date || '',
      last_independent_audit_date: row.last_independent_audit_date || '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id || !form.pharmacy_facility_id) {
      setError('A contract pharmacy facility is required — add one on the Facilities page first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        last_internal_audit_date: form.last_internal_audit_date || null,
        last_independent_audit_date: form.last_independent_audit_date || null,
      };
      if (editing) await updatePharmacyContract(editing.id, payload);
      else await createPharmacyContract({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this contract pharmacy relationship?')) return;
    await deletePharmacyContract(row.id);
    await load();
  }

  function facilityName(id) {
    return pharmacies.find((p) => p.id === id)?.name || '—';
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Contract Pharmacies</h2>
          <div className="toolbar-sub">HRSA recommends quarterly internal and annual independent audits of each relationship.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New contract
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Handshake size={28} />
              <p>No contract pharmacy relationships yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Contract dates</th>
                  <th>Internal audit</th>
                  <th>Independent audit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const internalOverdue = auditOverdue(row.last_internal_audit_date, 3);
                  const independentOverdue = auditOverdue(row.last_independent_audit_date, 12);
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{facilityName(row.pharmacy_facility_id)}</td>
                      <td>{row.contract_start_date || '—'} → {row.contract_end_date || '—'}</td>
                      <td>
                        {row.last_internal_audit_date || 'Never'}
                        {internalOverdue && <span className="badge badge-warn" style={{ marginLeft: 6 }}><AlertTriangle size={11} /> Overdue</span>}
                      </td>
                      <td>
                        {row.last_independent_audit_date || 'Never'}
                        {independentOverdue && <span className="badge badge-warn" style={{ marginLeft: 6 }}><AlertTriangle size={11} /> Overdue</span>}
                      </td>
                      <td><StatusBadge status={row.status} /></td>
                      <td className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit contract' : 'New contract'}</h3>
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
                  <label>Contract pharmacy facility</label>
                  <select value={form.pharmacy_facility_id} onChange={(e) => setForm({ ...form, pharmacy_facility_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {pharmacies.length === 0 && (
                    <div className="field-hint">No contract-pharmacy facilities yet — add one on the Facilities page first.</div>
                  )}
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Contract start</label>
                    <input type="date" value={form.contract_start_date} onChange={(e) => setForm({ ...form, contract_start_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Contract end</label>
                    <input type="date" value={form.contract_end_date} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Last internal audit</label>
                    <input type="date" value={form.last_internal_audit_date} onChange={(e) => setForm({ ...form, last_internal_audit_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Last independent audit</label>
                    <input type="date" value={form.last_independent_audit_date} onChange={(e) => setForm({ ...form, last_independent_audit_date: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="pending">Pending</option>
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
