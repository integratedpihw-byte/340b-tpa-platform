import React, { useEffect, useState } from 'react';
import { Plus, Lightbulb, X, Trash2 } from 'lucide-react';
import { fetchOpportunities, fetchCoveredEntities, fetchOrgUsers, createOpportunity, updateOpportunity, deleteOpportunity } from '../lib/api';

const OPPORTUNITY_TYPES = ['contract_pharmacy_expansion', 'formulary_optimization', 'split_billing_improvement', '340b_eligibility_recapture', 'other'];

const emptyForm = {
  covered_entity_id: '', opportunity_type: 'contract_pharmacy_expansion', estimated_annual_value: '',
  description: '', status: 'identified', identified_date: '', owner_user_id: '',
};

function StatusBadge({ status }) {
  const cls = status === 'implemented' ? 'badge-good' : status === 'declined' ? 'badge-neutral' : status === 'pursuing' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function Opportunities({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [o, e, u] = await Promise.all([fetchOpportunities(org.id), fetchCoveredEntities(org.id), fetchOrgUsers(org.id)]);
      setRows(o);
      setEntities(e);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '', identified_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id || '',
      opportunity_type: row.opportunity_type,
      estimated_annual_value: row.estimated_annual_value ?? '',
      description: row.description || '',
      status: row.status,
      identified_date: row.identified_date || '',
      owner_user_id: row.owner_user_id || '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id) { setError('A covered entity is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        estimated_annual_value: form.estimated_annual_value === '' ? null : Number(form.estimated_annual_value),
        owner_user_id: form.owner_user_id || null,
        identified_date: form.identified_date || null,
      };
      if (editing) await updateOpportunity(editing.id, payload);
      else await createOpportunity({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this opportunity?')) return;
    await deleteOpportunity(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Opportunities</h2>
          <div className="toolbar-sub">Identified ways to grow or protect 340B savings.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New opportunity
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Lightbulb size={28} />
              <p>No opportunities logged yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Est. annual value</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.opportunity_type.replace(/_/g, ' ')}</td>
                    <td>{row.covered_entities?.name || '—'}</td>
                    <td>{money(row.estimated_annual_value)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.users?.email || '—'}</td>
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
              <h3>{editing ? 'Edit opportunity' : 'New opportunity'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Covered entity</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Opportunity type</label>
                    <select value={form.opportunity_type} onChange={(e) => setForm({ ...form, opportunity_type: e.target.value })}>
                      {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Estimated annual value ($)</label>
                    <input type="number" step="0.01" value={form.estimated_annual_value} onChange={(e) => setForm({ ...form, estimated_annual_value: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="identified">Identified</option>
                      <option value="evaluating">Evaluating</option>
                      <option value="pursuing">Pursuing</option>
                      <option value="implemented">Implemented</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Identified date</label>
                    <input type="date" value={form.identified_date} onChange={(e) => setForm({ ...form, identified_date: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Owner</label>
                  <select value={form.owner_user_id} onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
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
