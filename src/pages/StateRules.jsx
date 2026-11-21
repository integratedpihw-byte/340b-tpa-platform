import React, { useEffect, useState } from 'react';
import { AlertTriangle, Map, Plus, Trash2, X } from 'lucide-react';
import { createStateRule, deleteStateRule, fetchStateRules, updateStateRule } from '../lib/api';

const MCO_LABELS = {
  unknown: 'Not recorded',
  none: 'No identifier required',
  scc_20: 'Submission Clarification Code 20',
  modifier: 'Claim modifier',
  other: 'Other identifier',
};
const CP_LABELS = {
  unknown: 'Not recorded',
  not_allowed: 'Contract pharmacies must carve out',
  allowed_by_arrangement: 'Allowed with a state arrangement',
};
const emptyForm = { state: '', mco_identifier_method: 'unknown', contract_pharmacy_medicaid: 'unknown', summary: '', source_url: '', last_reviewed_on: '' };

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function reviewOverdue(date) {
  if (!date) return true;
  const due = new Date(date);
  due.setFullYear(due.getFullYear() + 1);
  return due < new Date();
}

export default function StateRules({ org }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try { setRows(await fetchStateRules(org.id)); } catch (err) { setLoadError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [org.id]);

  function openNew() { setEditing(null); setForm(emptyForm); setError(''); setShowForm(true); }
  function openEdit(row) {
    setEditing(row);
    setForm({
      state: row.state, mco_identifier_method: row.mco_identifier_method, contract_pharmacy_medicaid: row.contract_pharmacy_medicaid,
      summary: row.summary || '', source_url: row.source_url || '', last_reviewed_on: row.last_reviewed_on || '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const state = form.state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) { setError('Enter the state as a two-letter code, for example OH.'); return; }
    if (form.source_url.trim() && !safeUrl(form.source_url.trim())) { setError('The source link must start with https:// or http://.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        state,
        mco_identifier_method: form.mco_identifier_method,
        contract_pharmacy_medicaid: form.contract_pharmacy_medicaid,
        summary: form.summary.trim() || null,
        source_url: form.source_url.trim() || null,
        last_reviewed_on: form.last_reviewed_on || null,
      };
      if (editing) await updateStateRule(editing.id, payload);
      else await createStateRule({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.code === '23505' ? `There is already a note for ${state}. Edit that one instead.` : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete the note for ${row.state}?`)) return;
    try { await deleteStateRule(row.id); await load(); } catch (err) { setLoadError(err.message); }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>State Medicaid rules</h2>
          <div className="toolbar-sub">
            Each state decides how 340B claims are identified in Medicaid managed care. Keep a note of what each state you bill requires, where you found it, and when you last checked.
            Nothing here is pre-filled; the analysis uses only what you record.
          </div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}><Plus size={15} /> New note</button>
      </div>

      {loadError && <div className="alert alert-error">{loadError}</div>}

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state"><Map size={28} /><p>No state notes yet. Add one for each state where you have a Medicaid enrollment.</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>State</th><th>Managed care 340B claim identifier</th><th>Contract pharmacies and Medicaid</th><th>Last reviewed</th><th>Notes and source</th><th></th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const url = r.source_url ? safeUrl(r.source_url) : null;
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.state}</td>
                        <td>{MCO_LABELS[r.mco_identifier_method]}</td>
                        <td>{CP_LABELS[r.contract_pharmacy_medicaid]}</td>
                        <td>
                          {r.last_reviewed_on || 'Never'}
                          {reviewOverdue(r.last_reviewed_on) && <span className="badge badge-warn" style={{ marginLeft: 6 }}><AlertTriangle size={11} /> Review due</span>}
                        </td>
                        <td style={{ maxWidth: 360 }}>
                          {r.summary || '—'}
                          {url && <div><a href={url} target="_blank" rel="noopener noreferrer">Source</a></div>}
                        </td>
                        <td className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-sub" style={{ lineHeight: 1.6 }}>
        <strong>How these are used.</strong> If you record that a state uses an identifier (for example Submission Clarification Code 20), Medicaid managed care prescriptions for that state that were dispensed at 340B pricing without the "marked as a 340B claim" box ticked are flagged.
        A review older than a year is flagged too. Check the state Medicaid agency or your managed care plan contract for the current requirement.
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? `Edit note for ${editing.state}` : 'New state note'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>State</label>
                  <input value={form.state} maxLength={2} disabled={!!editing} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="e.g. OH" />
                </div>
                <div className="field">
                  <label>How managed care 340B claims are identified</label>
                  <select value={form.mco_identifier_method} onChange={(e) => setForm({ ...form, mco_identifier_method: e.target.value })}>
                    {Object.entries(MCO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Contract pharmacies and Medicaid fee-for-service</label>
                  <select value={form.contract_pharmacy_medicaid} onChange={(e) => setForm({ ...form, contract_pharmacy_medicaid: e.target.value })}>
                    {Object.entries(CP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What the state requires, and from whom (agency, plan, contract)" />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Source link</label>
                    <input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://…" />
                  </div>
                  <div className="field">
                    <label>Last reviewed</label>
                    <input type="date" value={form.last_reviewed_on} onChange={(e) => setForm({ ...form, last_reviewed_on: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
