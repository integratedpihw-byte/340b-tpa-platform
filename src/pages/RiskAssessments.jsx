import React, { useEffect, useState } from 'react';
import { Plus, Gauge, X, Trash2 } from 'lucide-react';
import { fetchRiskAssessments, fetchCoveredEntities, fetchOrgUsers, createRiskAssessment, updateRiskAssessment, deleteRiskAssessment } from '../lib/api';

const RISK_AREAS = ['program_integrity', 'hrsa_audit_readiness', 'contract_pharmacy', 'inventory_management', 'claims_accuracy', 'other'];

const emptyForm = {
  covered_entity_id: '', assessment_date: '', risk_area: 'program_integrity', risk_level: 'medium',
  findings_summary: '', recommendations: '', assessed_by: '', next_review_date: '',
};

function RiskBadge({ level }) {
  const cls = level === 'high' ? 'badge-bad' : level === 'medium' ? 'badge-warn' : 'badge-good';
  return <span className={`badge ${cls}`}>{level}</span>;
}

export default function RiskAssessments({ org }) {
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
      const [r, e, u] = await Promise.all([fetchRiskAssessments(org.id), fetchCoveredEntities(org.id), fetchOrgUsers(org.id)]);
      setRows(r);
      setEntities(e);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '', assessment_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id || '',
      assessment_date: row.assessment_date,
      risk_area: row.risk_area,
      risk_level: row.risk_level,
      findings_summary: row.findings_summary || '',
      recommendations: row.recommendations || '',
      assessed_by: row.assessed_by || '',
      next_review_date: row.next_review_date || '',
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
        assessed_by: form.assessed_by || null,
        next_review_date: form.next_review_date || null,
      };
      if (editing) await updateRiskAssessment(editing.id, payload);
      else await createRiskAssessment({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this risk assessment?')) return;
    await deleteRiskAssessment(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Risk Assessments</h2>
          <div className="toolbar-sub">Periodic program-integrity and audit-readiness reviews.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New assessment
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Gauge size={28} />
              <p>No risk assessments yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Risk area</th>
                  <th>Level</th>
                  <th>Assessed</th>
                  <th>Next review</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.covered_entities?.name || '—'}</td>
                    <td>{row.risk_area.replace(/_/g, ' ')}</td>
                    <td><RiskBadge level={row.risk_level} /></td>
                    <td>{row.assessment_date}</td>
                    <td>{row.next_review_date || '—'}</td>
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
              <h3>{editing ? 'Edit assessment' : 'New risk assessment'}</h3>
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
                    <label>Risk area</label>
                    <select value={form.risk_area} onChange={(e) => setForm({ ...form, risk_area: e.target.value })}>
                      {RISK_AREAS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Risk level</label>
                    <select value={form.risk_level} onChange={(e) => setForm({ ...form, risk_level: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Findings summary</label>
                  <textarea rows={3} value={form.findings_summary} onChange={(e) => setForm({ ...form, findings_summary: e.target.value })} />
                </div>
                <div className="field">
                  <label>Recommendations</label>
                  <textarea rows={3} value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} />
                </div>
                <div className="field">
                  <label>Assessed by</label>
                  <select value={form.assessed_by} onChange={(e) => setForm({ ...form, assessed_by: e.target.value })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Assessment date</label>
                    <input type="date" value={form.assessment_date} onChange={(e) => setForm({ ...form, assessment_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Next review date</label>
                    <input type="date" value={form.next_review_date} onChange={(e) => setForm({ ...form, next_review_date: e.target.value })} />
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
