import React, { useEffect, useState } from 'react';
import { Plus, Radar, X, Trash2 } from 'lucide-react';
import { fetchRiskScores, fetchCoveredEntities, createRiskScore, updateRiskScore, deleteRiskScore } from '../lib/api';

const emptyForm = {
  covered_entity_id: '', score_date: '', overall_score: '', program_integrity_score: '',
  audit_readiness_score: '', financial_health_score: '', contributing_factors: '',
};

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="badge badge-neutral">—</span>;
  const n = Number(score);
  const cls = n >= 80 ? 'badge-good' : n >= 50 ? 'badge-warn' : 'badge-bad';
  return <span className={`badge ${cls}`}>{n}</span>;
}

export default function RiskScores({ org }) {
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
      const [s, e] = await Promise.all([fetchRiskScores(org.id), fetchCoveredEntities(org.id)]);
      setRows(s);
      setEntities(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '', score_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id || '',
      score_date: row.score_date,
      overall_score: row.overall_score ?? '',
      program_integrity_score: row.program_integrity_score ?? '',
      audit_readiness_score: row.audit_readiness_score ?? '',
      financial_health_score: row.financial_health_score ?? '',
      contributing_factors: row.contributing_factors ? JSON.stringify(row.contributing_factors, null, 2) : '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id || !form.score_date) { setError('A covered entity and score date are required.'); return; }
    setBusy(true);
    setError('');
    try {
      let factors = null;
      if (form.contributing_factors.trim()) {
        try { factors = JSON.parse(form.contributing_factors); }
        catch { setError('Contributing factors must be valid JSON, or left blank.'); setBusy(false); return; }
      }
      const payload = {
        covered_entity_id: form.covered_entity_id,
        score_date: form.score_date,
        overall_score: form.overall_score === '' ? null : Number(form.overall_score),
        program_integrity_score: form.program_integrity_score === '' ? null : Number(form.program_integrity_score),
        audit_readiness_score: form.audit_readiness_score === '' ? null : Number(form.audit_readiness_score),
        financial_health_score: form.financial_health_score === '' ? null : Number(form.financial_health_score),
        contributing_factors: factors,
      };
      if (editing) await updateRiskScore(editing.id, payload);
      else await createRiskScore({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this risk score?')) return;
    await deleteRiskScore(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Risk Scores</h2>
          <div className="toolbar-sub">Point-in-time intelligence rollups, derived from Phases 1–5.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New score
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Radar size={28} />
              <p>No risk scores recorded yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Date</th>
                  <th>Overall</th>
                  <th>Program integrity</th>
                  <th>Audit readiness</th>
                  <th>Financial health</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.covered_entities?.name || '—'}</td>
                    <td>{row.score_date}</td>
                    <td><ScoreBadge score={row.overall_score} /></td>
                    <td>{row.program_integrity_score ?? '—'}</td>
                    <td>{row.audit_readiness_score ?? '—'}</td>
                    <td>{row.financial_health_score ?? '—'}</td>
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
              <h3>{editing ? 'Edit risk score' : 'New risk score'}</h3>
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
                <div className="field">
                  <label>Score date</label>
                  <input type="date" value={form.score_date} onChange={(e) => setForm({ ...form, score_date: e.target.value })} />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Overall score (0–100)</label>
                    <input type="number" min="0" max="100" value={form.overall_score} onChange={(e) => setForm({ ...form, overall_score: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Program integrity</label>
                    <input type="number" min="0" max="100" value={form.program_integrity_score} onChange={(e) => setForm({ ...form, program_integrity_score: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Audit readiness</label>
                    <input type="number" min="0" max="100" value={form.audit_readiness_score} onChange={(e) => setForm({ ...form, audit_readiness_score: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Financial health</label>
                    <input type="number" min="0" max="100" value={form.financial_health_score} onChange={(e) => setForm({ ...form, financial_health_score: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Contributing factors (JSON, optional)</label>
                  <textarea rows={4} value={form.contributing_factors} onChange={(e) => setForm({ ...form, contributing_factors: e.target.value })} placeholder='{"open_findings": 2, "high_risk_assessments": 1}' />
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
