import React, { useEffect, useState } from 'react';
import { Plus, ClipboardList, X, Trash2 } from 'lucide-react';
import { fetchTestingEncounters, fetchTestingSites, fetchOrgUsers, createTestingEncounter, updateTestingEncounter, deleteTestingEncounter } from '../lib/api';

const emptyForm = {
  testing_site_id: '', counselor_user_id: '', client_ref: '', test_type: 'rapid_antibody',
  result: 'pending', encounter_date: '', risk_screening_completed: false, referred_to_prep: false,
};

function ResultBadge({ result }) {
  const cls = result === 'positive' ? 'badge-bad' : result === 'negative' ? 'badge-good' : result === 'indeterminate' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{result}</span>;
}

export default function TestingEncounters({ org }) {
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState([]);
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
      const [enc, s, u] = await Promise.all([fetchTestingEncounters(org.id), fetchTestingSites(org.id), fetchOrgUsers(org.id)]);
      setRows(enc);
      setSites(s);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, testing_site_id: sites[0]?.id || '', encounter_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      testing_site_id: row.testing_site_id,
      counselor_user_id: row.counselor_user_id || '',
      client_ref: row.client_ref || '',
      test_type: row.test_type,
      result: row.result,
      encounter_date: row.encounter_date,
      risk_screening_completed: row.risk_screening_completed,
      referred_to_prep: row.referred_to_prep,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.testing_site_id) { setError('Add a testing site first.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, counselor_user_id: form.counselor_user_id || null };
      if (editing) await updateTestingEncounter(editing.id, payload);
      else await createTestingEncounter({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this testing encounter?')) return;
    await deleteTestingEncounter(row.id);
    await load();
  }

  function siteLabel(id) {
    const s = sites.find((x) => x.id === id);
    return s?.facilities?.name || '—';
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Testing Encounters</h2>
          <div className="toolbar-sub">Individual testing encounters, tracked by internal reference only.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New encounter
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={28} />
              <p>No testing encounters yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Test type</th>
                  <th>Result</th>
                  <th>Counselor</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.testing_sites?.facilities?.name || siteLabel(row.testing_site_id)}</td>
                    <td>{row.test_type.replace('_', ' ')}</td>
                    <td><ResultBadge result={row.result} /></td>
                    <td>{row.users?.email || '—'}</td>
                    <td>{row.encounter_date}</td>
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
              <h3>{editing ? 'Edit encounter' : 'New testing encounter'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Testing site</label>
                  <select value={form.testing_site_id} onChange={(e) => setForm({ ...form, testing_site_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.facilities?.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Counselor</label>
                  <select value={form.counselor_user_id} onChange={(e) => setForm({ ...form, counselor_user_id: e.target.value })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Client reference (internal only — no name/DOB)</label>
                  <input value={form.client_ref} onChange={(e) => setForm({ ...form, client_ref: e.target.value })} />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Test type</label>
                    <select value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })}>
                      <option value="rapid_antibody">Rapid antibody</option>
                      <option value="ab_ag_combo">Ab/Ag combo</option>
                      <option value="rna">RNA</option>
                      <option value="self_test">Self-test</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Result</label>
                    <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                      <option value="pending">Pending</option>
                      <option value="negative">Negative</option>
                      <option value="positive">Positive</option>
                      <option value="indeterminate">Indeterminate</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Encounter date</label>
                  <input type="date" value={form.encounter_date} onChange={(e) => setForm({ ...form, encounter_date: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={form.risk_screening_completed} onChange={(e) => setForm({ ...form, risk_screening_completed: e.target.checked })} style={{ width: 'auto' }} />
                    Risk screening completed
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={form.referred_to_prep} onChange={(e) => setForm({ ...form, referred_to_prep: e.target.checked })} style={{ width: 'auto' }} />
                    Referred to PrEP
                  </label>
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
