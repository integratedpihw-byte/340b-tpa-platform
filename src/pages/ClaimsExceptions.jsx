import React, { useEffect, useState } from 'react';
import { Plus, AlertOctagon, X, Trash2 } from 'lucide-react';
import { fetchClaimsExceptions, fetchPayerReconciliations, fetchMedicareClaims, createClaimsException, updateClaimsException, deleteClaimsException } from '../lib/api';

const emptyForm = { reconciliation_id: '', medicare_claim_id: '', exception_type: 'other', description: '', status: 'open' };

const TYPE_LABELS = {
  duplicate_discount: 'Duplicate discount',
  missing_modifier: 'Missing modifier',
  eligibility_mismatch: 'Eligibility mismatch',
  pricing_discrepancy: 'Pricing discrepancy',
  other: 'Other',
};

function StatusBadge({ status }) {
  const cls = status === 'resolved' ? 'badge-good' : status === 'waived' ? 'badge-neutral' : 'badge-bad';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function ClaimsExceptions({ org }) {
  const [rows, setRows] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [ex, r, c] = await Promise.all([fetchClaimsExceptions(org.id), fetchPayerReconciliations(org.id), fetchMedicareClaims(org.id)]);
      setRows(ex);
      setReconciliations(r);
      setClaims(c);
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
      reconciliation_id: row.reconciliation_id || '',
      medicare_claim_id: row.medicare_claim_id || '',
      exception_type: row.exception_type,
      description: row.description || '',
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
        reconciliation_id: form.reconciliation_id || null,
        medicare_claim_id: form.medicare_claim_id || null,
        resolved_at: form.status !== 'open' ? new Date().toISOString() : (editing?.resolved_at || null),
      };
      if (editing) await updateClaimsException(editing.id, payload);
      else await createClaimsException({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this exception?')) return;
    await deleteClaimsException(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Claims Exceptions</h2>
          <div className="toolbar-sub">What reconciliation surfaces, worked until resolved.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> Log exception
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <AlertOctagon size={28} />
              <p>No exceptions logged.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Linked to</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{TYPE_LABELS[row.exception_type]}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      {row.medicare_claims ? `Claim: ${row.medicare_claims.claim_number || row.medicare_claims.drug_name}` : ''}
                      {row.payer_reconciliations ? `${row.medicare_claims ? ' · ' : ''}Reconciliation: ${row.payer_reconciliations.payer_type}` : ''}
                      {!row.medicare_claims && !row.payer_reconciliations && '—'}
                    </td>
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
              <h3>{editing ? 'Edit exception' : 'Log exception'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Exception type</label>
                  <select value={form.exception_type} onChange={(e) => setForm({ ...form, exception_type: e.target.value })}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field">
                  <label>Related reconciliation (optional)</label>
                  <select value={form.reconciliation_id} onChange={(e) => setForm({ ...form, reconciliation_id: e.target.value })}>
                    <option value="">—</option>
                    {reconciliations.map((r) => <option key={r.id} value={r.id}>{r.payer_type} · {r.period_start || '?'} → {r.period_end || '?'}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Related Medicare claim (optional)</label>
                  <select value={form.medicare_claim_id} onChange={(e) => setForm({ ...form, medicare_claim_id: e.target.value })}>
                    <option value="">—</option>
                    {claims.map((c) => <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)} · {c.drug_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="waived">Waived</option>
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
