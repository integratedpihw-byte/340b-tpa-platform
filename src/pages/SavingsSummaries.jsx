import React, { useEffect, useState } from 'react';
import { Plus, PiggyBank, X, Trash2 } from 'lucide-react';
import { fetchSavingsSummaries, fetchCoveredEntities, createSavingsSummary, updateSavingsSummary, deleteSavingsSummary } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', period_start: '', period_end: '', gross_savings: '', net_savings: '',
  acquisition_cost: '', reimbursement_total: '', prescriptions_count: '',
};

function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SavingsSummaries({ org }) {
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
      const [s, e] = await Promise.all([fetchSavingsSummaries(org.id), fetchCoveredEntities(org.id)]);
      setRows(s);
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
      covered_entity_id: row.covered_entity_id || '',
      period_start: row.period_start,
      period_end: row.period_end,
      gross_savings: row.gross_savings ?? '',
      net_savings: row.net_savings ?? '',
      acquisition_cost: row.acquisition_cost ?? '',
      reimbursement_total: row.reimbursement_total ?? '',
      prescriptions_count: row.prescriptions_count ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id || !form.period_start || !form.period_end) {
      setError('Covered entity, period start, and period end are all required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        gross_savings: form.gross_savings === '' ? null : Number(form.gross_savings),
        net_savings: form.net_savings === '' ? null : Number(form.net_savings),
        acquisition_cost: form.acquisition_cost === '' ? null : Number(form.acquisition_cost),
        reimbursement_total: form.reimbursement_total === '' ? null : Number(form.reimbursement_total),
        prescriptions_count: form.prescriptions_count === '' ? null : parseInt(form.prescriptions_count, 10),
      };
      if (editing) await updateSavingsSummary(editing.id, payload);
      else await createSavingsSummary({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this savings summary?')) return;
    await deleteSavingsSummary(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Savings Summaries</h2>
          <div className="toolbar-sub">Per-period 340B savings performance, by covered entity.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New summary
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <PiggyBank size={28} />
              <p>No savings summaries yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Period</th>
                  <th>Gross savings</th>
                  <th>Net savings</th>
                  <th>Rx count</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.covered_entities?.name || '—'}</td>
                    <td>{row.period_start} – {row.period_end}</td>
                    <td>{money(row.gross_savings)}</td>
                    <td>{money(row.net_savings)}</td>
                    <td>{row.prescriptions_count ?? '—'}</td>
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
              <h3>{editing ? 'Edit summary' : 'New savings summary'}</h3>
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
                    <label>Gross savings ($)</label>
                    <input type="number" step="0.01" value={form.gross_savings} onChange={(e) => setForm({ ...form, gross_savings: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Net savings ($)</label>
                    <input type="number" step="0.01" value={form.net_savings} onChange={(e) => setForm({ ...form, net_savings: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Acquisition cost ($)</label>
                    <input type="number" step="0.01" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Reimbursement total ($)</label>
                    <input type="number" step="0.01" value={form.reimbursement_total} onChange={(e) => setForm({ ...form, reimbursement_total: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Prescriptions count</label>
                  <input type="number" value={form.prescriptions_count} onChange={(e) => setForm({ ...form, prescriptions_count: e.target.value })} />
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
