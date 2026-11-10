import React, { useEffect, useState } from 'react';
import { Plus, Stethoscope, X, Trash2, AlertTriangle } from 'lucide-react';
import { fetchMedicareClaims, fetchCoveredEntities, fetchFacilities, createMedicareClaim, updateMedicareClaim, deleteMedicareClaim } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', facility_id: '', claim_number: '', part: 'B', ndc: '', drug_name: '',
  tb_modifier_applied: false, billed_amount: '', allowed_amount: '', claim_date: '', status: 'submitted',
};

function StatusBadge({ status }) {
  const cls = status === 'paid' ? 'badge-good' : status === 'denied' ? 'badge-bad' : status === 'adjusted' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function MedicareClaims({ org }) {
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
      const [c, e, f] = await Promise.all([fetchMedicareClaims(org.id), fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      setRows(c);
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
      claim_number: row.claim_number || '',
      part: row.part,
      ndc: row.ndc || '',
      drug_name: row.drug_name || '',
      tb_modifier_applied: row.tb_modifier_applied,
      billed_amount: row.billed_amount ?? '',
      allowed_amount: row.allowed_amount ?? '',
      claim_date: row.claim_date || '',
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
        billed_amount: form.billed_amount === '' ? null : Number(form.billed_amount),
        allowed_amount: form.allowed_amount === '' ? null : Number(form.allowed_amount),
        claim_date: form.claim_date || null,
      };
      if (editing) await updateMedicareClaim(editing.id, payload);
      else await createMedicareClaim({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete claim ${row.claim_number || row.id.slice(0, 8)}?`)) return;
    await deleteMedicareClaim(row.id);
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
          <h2>Medicare Claims</h2>
          <div className="toolbar-sub">Part B requires the TB modifier on applicable 340B claims; Part D is plan-specific.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New claim
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Stethoscope size={28} />
              <p>No Medicare claims yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Part</th>
                  <th>Drug</th>
                  <th>TB modifier</th>
                  <th>Billed / Allowed</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flagMissing = row.part === 'B' && !row.tb_modifier_applied;
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.claim_number || row.id.slice(0, 8)}</td>
                      <td>{row.part}</td>
                      <td>{row.drug_name || '—'}</td>
                      <td>
                        {row.tb_modifier_applied ? <span className="badge badge-good">Applied</span> : <span className="badge badge-neutral">Not applied</span>}
                        {flagMissing && <span className="badge badge-warn" style={{ marginLeft: 6 }}><AlertTriangle size={11} /> Part B check</span>}
                      </td>
                      <td>{row.billed_amount != null ? `$${Number(row.billed_amount).toFixed(2)}` : '—'} / {row.allowed_amount != null ? `$${Number(row.allowed_amount).toFixed(2)}` : '—'}</td>
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
              <h3>{editing ? 'Edit claim' : 'New Medicare claim'}</h3>
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
                  <label>Billing facility</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Claim number</label>
                    <input value={form.claim_number} onChange={(e) => setForm({ ...form, claim_number: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Part</label>
                    <select value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })}>
                      <option value="B">Part B</option>
                      <option value="D">Part D</option>
                    </select>
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Drug name</label>
                    <input value={form.drug_name} onChange={(e) => setForm({ ...form, drug_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>NDC</label>
                    <input value={form.ndc} onChange={(e) => setForm({ ...form, ndc: e.target.value })} />
                  </div>
                </div>
                {form.part === 'B' && (
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.tb_modifier_applied} onChange={(e) => setForm({ ...form, tb_modifier_applied: e.target.checked })} style={{ width: 'auto' }} />
                      TB modifier applied
                    </label>
                  </div>
                )}
                <div className="inline-form">
                  <div className="field">
                    <label>Billed amount ($)</label>
                    <input type="number" step="any" value={form.billed_amount} onChange={(e) => setForm({ ...form, billed_amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Allowed amount ($)</label>
                    <input type="number" step="any" value={form.allowed_amount} onChange={(e) => setForm({ ...form, allowed_amount: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Claim date</label>
                    <input type="date" value={form.claim_date} onChange={(e) => setForm({ ...form, claim_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="submitted">Submitted</option>
                      <option value="paid">Paid</option>
                      <option value="denied">Denied</option>
                      <option value="adjusted">Adjusted</option>
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
