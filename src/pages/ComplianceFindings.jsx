import React, { useEffect, useState } from 'react';
import { Plus, ShieldAlert, X, Trash2 } from 'lucide-react';
import { fetchComplianceFindings, fetchCoveredEntities, fetchFacilities, createComplianceFinding, updateComplianceFinding, deleteComplianceFinding } from '../lib/api';

const FINDING_TYPES = ['duplicate_discount', 'diversion', 'ineligible_patient', 'inventory_discrepancy', 'contract_pharmacy_violation', 'other'];

const emptyForm = {
  covered_entity_id: '', facility_id: '', finding_type: 'duplicate_discount', severity: 'medium',
  description: '', discovered_date: '', status: 'open', resolved_date: '', resolution_notes: '',
};

function SeverityBadge({ severity }) {
  const cls = severity === 'critical' ? 'badge-bad' : severity === 'high' ? 'badge-bad' : severity === 'medium' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{severity}</span>;
}

function StatusBadge({ status }) {
  const cls = status === 'resolved' || status === 'false_positive' ? 'badge-good' : status === 'remediation_in_progress' ? 'badge-warn' : 'badge-bad';
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

export default function ComplianceFindings({ org }) {
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
      const [f, e, fac] = await Promise.all([fetchComplianceFindings(org.id), fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      setRows(f);
      setEntities(e);
      setFacilities(fac);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '', discovered_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id || '',
      facility_id: row.facility_id || '',
      finding_type: row.finding_type,
      severity: row.severity,
      description: row.description || '',
      discovered_date: row.discovered_date,
      status: row.status,
      resolved_date: row.resolved_date || '',
      resolution_notes: row.resolution_notes || '',
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
        facility_id: form.facility_id || null,
        resolved_date: form.resolved_date || null,
      };
      if (editing) await updateComplianceFinding(editing.id, payload);
      else await createComplianceFinding({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this compliance finding?')) return;
    await deleteComplianceFinding(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Compliance Findings</h2>
          <div className="toolbar-sub">Program-integrity issues discovered across 340B operations.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> Log finding
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={28} />
              <p>No compliance findings logged.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Discovered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.finding_type.replace(/_/g, ' ')}</td>
                    <td>{row.covered_entities?.name || '—'}</td>
                    <td><SeverityBadge severity={row.severity} /></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.discovered_date}</td>
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
              <h3>{editing ? 'Edit finding' : 'Log compliance finding'}</h3>
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
                  <label>Facility (optional)</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Finding type</label>
                    <select value={form.finding_type} onChange={(e) => setForm({ ...form, finding_type: e.target.value })}>
                      {FINDING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Severity</label>
                    <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Discovered date</label>
                    <input type="date" value={form.discovered_date} onChange={(e) => setForm({ ...form, discovered_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="open">Open</option>
                      <option value="remediation_in_progress">Remediation in progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="false_positive">False positive</option>
                    </select>
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Resolved date</label>
                    <input type="date" value={form.resolved_date} onChange={(e) => setForm({ ...form, resolved_date: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Resolution notes</label>
                  <textarea rows={2} value={form.resolution_notes} onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })} />
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
