import React, { useEffect, useState } from 'react';
import { Plus, TestTube, X, Trash2 } from 'lucide-react';
import { fetchTestingSites, fetchFacilities, createTestingSite, updateTestingSite, deleteTestingSite } from '../lib/api';

const MODALITIES = ['rapid_antibody', 'ab_ag_combo', 'rna', 'self_test'];
const emptyForm = { facility_id: '', testing_modalities: [], funding_source: '', clia_number: '', hours_of_operation: '', status: 'active' };

export default function TestingSites({ org }) {
  const [rows, setRows] = useState([]);
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
      const [s, f] = await Promise.all([fetchTestingSites(org.id), fetchFacilities(org.id)]);
      setRows(s);
      setFacilities(f.filter((x) => x.facility_type === 'testing_site'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, facility_id: facilities[0]?.id || '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      facility_id: row.facility_id,
      testing_modalities: row.testing_modalities || [],
      funding_source: row.funding_source || '',
      clia_number: row.clia_number || '',
      hours_of_operation: row.hours_of_operation || '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  function toggleModality(m) {
    setForm((f) => ({
      ...f,
      testing_modalities: f.testing_modalities.includes(m) ? f.testing_modalities.filter((x) => x !== m) : [...f.testing_modalities, m],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.facility_id) { setError('A testing-site facility is required — add one on the Facilities page first.'); return; }
    setBusy(true);
    setError('');
    try {
      if (editing) await updateTestingSite(editing.id, form);
      else await createTestingSite({ ...form, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this testing site record?')) return;
    await deleteTestingSite(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Testing Sites</h2>
          <div className="toolbar-sub">HIV-program detail layered onto each testing-site facility.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New testing site
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <TestTube size={28} />
              <p>No testing sites yet.</p>
              <p style={{ fontSize: 12.5 }}>Add a facility with type "HIV Testing Site" on the Facilities page first.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Modalities</th>
                  <th>CLIA #</th>
                  <th>Funding</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.facilities?.name || '—'}</td>
                    <td>{(row.testing_modalities || []).map((m) => m.replace('_', ' ')).join(', ') || '—'}</td>
                    <td>{row.clia_number || '—'}</td>
                    <td>{row.funding_source || '—'}</td>
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
              <h3>{editing ? 'Edit testing site' : 'New testing site'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Facility</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Testing modalities offered</label>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {MODALITIES.map((m) => (
                      <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={form.testing_modalities.includes(m)} onChange={() => toggleModality(m)} style={{ width: 'auto' }} />
                        {m.replace('_', ' ')}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>CLIA number</label>
                    <input value={form.clia_number} onChange={(e) => setForm({ ...form, clia_number: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Funding source</label>
                    <input value={form.funding_source} onChange={(e) => setForm({ ...form, funding_source: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Hours of operation</label>
                  <input value={form.hours_of_operation} onChange={(e) => setForm({ ...form, hours_of_operation: e.target.value })} placeholder="e.g. Mon-Fri 9am-5pm" />
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
