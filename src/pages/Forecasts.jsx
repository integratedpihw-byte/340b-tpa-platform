import React, { useEffect, useState } from 'react';
import { Plus, TrendingUp, X, Trash2 } from 'lucide-react';
import { fetchForecasts, fetchCoveredEntities, createForecast, updateForecast, deleteForecast } from '../lib/api';

const FORECAST_TYPES = ['savings', 'claims_volume', 'inventory_demand', 'compliance_risk', 'other'];

const emptyForm = {
  covered_entity_id: '', forecast_type: 'savings', period_start: '', period_end: '',
  predicted_value: '', confidence_level: 'medium', methodology_notes: '',
};

function ConfidenceBadge({ level }) {
  const cls = level === 'high' ? 'badge-good' : level === 'medium' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{level}</span>;
}

export default function Forecasts({ org }) {
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
      const [f, e] = await Promise.all([fetchForecasts(org.id), fetchCoveredEntities(org.id)]);
      setRows(f);
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
      forecast_type: row.forecast_type,
      period_start: row.period_start,
      period_end: row.period_end,
      predicted_value: row.predicted_value ?? '',
      confidence_level: row.confidence_level,
      methodology_notes: row.methodology_notes || '',
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
        predicted_value: form.predicted_value === '' ? null : Number(form.predicted_value),
      };
      if (editing) await updateForecast(editing.id, payload);
      else await createForecast({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this forecast?')) return;
    await deleteForecast(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Forecasts</h2>
          <div className="toolbar-sub">Predicted savings, claims, inventory, and risk, by period.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New forecast
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <TrendingUp size={28} />
              <p>No forecasts recorded yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Predicted value</th>
                  <th>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.covered_entities?.name || '—'}</td>
                    <td>{row.forecast_type.replace(/_/g, ' ')}</td>
                    <td>{row.period_start} – {row.period_end}</td>
                    <td>{row.predicted_value ?? '—'}</td>
                    <td><ConfidenceBadge level={row.confidence_level} /></td>
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
              <h3>{editing ? 'Edit forecast' : 'New forecast'}</h3>
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
                    <label>Forecast type</label>
                    <select value={form.forecast_type} onChange={(e) => setForm({ ...form, forecast_type: e.target.value })}>
                      {FORECAST_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Confidence level</label>
                    <select value={form.confidence_level} onChange={(e) => setForm({ ...form, confidence_level: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
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
                <div className="field">
                  <label>Predicted value</label>
                  <input type="number" step="0.01" value={form.predicted_value} onChange={(e) => setForm({ ...form, predicted_value: e.target.value })} />
                </div>
                <div className="field">
                  <label>Methodology notes</label>
                  <textarea rows={3} value={form.methodology_notes} onChange={(e) => setForm({ ...form, methodology_notes: e.target.value })} placeholder="What inputs and time window this prediction drew on" />
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
