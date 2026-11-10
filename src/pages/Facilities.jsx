import React, { useEffect, useState } from 'react';
import { Plus, MapPinned, X, Trash2 } from 'lucide-react';
import { fetchFacilities, fetchCoveredEntities, createFacility, updateFacility, deleteFacility } from '../lib/api';

const FACILITY_TYPES = [
  ['clinic', 'Clinic'],
  ['contract_pharmacy', 'Contract Pharmacy'],
  ['testing_site', 'HIV Testing Site'],
  ['administrative', 'Administrative'],
];

const emptyForm = { covered_entity_id: '', facility_type: 'clinic', name: '', npi: '', status: 'active' };

export default function Facilities({ org }) {
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
      const [f, e] = await Promise.all([fetchFacilities(org.id), fetchCoveredEntities(org.id)]);
      setRows(f);
      setEntities(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function entityLabel(id) {
    const match = entities.find((e) => e.id === id);
    return match ? (match.opais_id || match.entity_type.replace('_', ' ')) : '—';
  }

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
      facility_type: row.facility_type,
      name: row.name,
      npi: row.npi || '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id) {
      setError('Create a covered entity first — every facility belongs to one.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, npi: form.npi || null };
      if (editing) {
        await updateFacility(editing.id, payload);
      } else {
        await createFacility({ ...payload, org_id: org.id });
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
    if (!confirm(`Delete facility "${row.name}"? This cannot be undone.`)) return;
    await deleteFacility(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Facilities</h2>
          <div className="toolbar-sub">Clinics, contract pharmacies, and testing sites under {org.name}.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New facility
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <MapPinned size={28} />
              <p>No facilities yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Covered entity</th>
                  <th>NPI</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td>{FACILITY_TYPES.find((t) => t[0] === row.facility_type)?.[1] || row.facility_type}</td>
                    <td>{entityLabel(row.covered_entity_id)}</td>
                    <td>{row.npi || '—'}</td>
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
              <h3>{editing ? 'Edit facility' : 'New facility'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Covered entity</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.opais_id || ent.entity_type.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Facility name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Facility type</label>
                  <select value={form.facility_type} onChange={(e) => setForm({ ...form, facility_type: e.target.value })}>
                    {FACILITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>NPI (optional)</label>
                  <input value={form.npi} onChange={(e) => setForm({ ...form, npi: e.target.value })} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
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
