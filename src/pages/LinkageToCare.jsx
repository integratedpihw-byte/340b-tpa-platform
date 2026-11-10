import React, { useEffect, useState } from 'react';
import { Plus, HeartPulse, X, Trash2 } from 'lucide-react';
import { fetchLinkageEvents, fetchTestingEncounters, fetchFacilities, createLinkageEvent, updateLinkageEvent, deleteLinkageEvent } from '../lib/api';

const EVENT_LABELS = {
  referral_made: 'Referral made',
  appointment_scheduled: 'Appointment scheduled',
  appointment_attended: 'Appointment attended',
  art_initiated: 'ART initiated',
  viral_suppression_confirmed: 'Viral suppression confirmed',
  lost_to_follow_up: 'Lost to follow-up',
};

function EventBadge({ type }) {
  const cls = type === 'viral_suppression_confirmed' ? 'badge-good' : type === 'lost_to_follow_up' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{EVENT_LABELS[type]}</span>;
}

const emptyForm = { testing_encounter_id: '', event_type: 'referral_made', event_date: '', facility_id: '', notes: '' };

export default function LinkageToCare({ org }) {
  const [rows, setRows] = useState([]);
  const [encounters, setEncounters] = useState([]);
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
      const [ev, enc, f] = await Promise.all([fetchLinkageEvents(org.id), fetchTestingEncounters(org.id), fetchFacilities(org.id)]);
      setRows(ev);
      setEncounters(enc.filter((e) => e.result === 'positive'));
      setFacilities(f);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, event_date: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      testing_encounter_id: row.testing_encounter_id || '',
      event_type: row.event_type,
      event_date: row.event_date,
      facility_id: row.facility_id || '',
      notes: row.notes || '',
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
        testing_encounter_id: form.testing_encounter_id || null,
        facility_id: form.facility_id || null,
      };
      if (editing) await updateLinkageEvent(editing.id, payload);
      else await createLinkageEvent({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this linkage-to-care event?')) return;
    await deleteLinkageEvent(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Linkage to Care</h2>
          <div className="toolbar-sub">From a positive result through ART and viral suppression.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> Log event
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <HeartPulse size={28} />
              <p>No linkage-to-care events logged.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Linked encounter</th>
                  <th>Facility</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><EventBadge type={row.event_type} /></td>
                    <td>{row.testing_encounters?.client_ref || '—'}</td>
                    <td>{row.facilities?.name || '—'}</td>
                    <td>{row.event_date}</td>
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
              <h3>{editing ? 'Edit event' : 'Log linkage-to-care event'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Event type</label>
                  <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
                    {Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Related testing encounter (optional — positive results only)</label>
                  <select value={form.testing_encounter_id} onChange={(e) => setForm({ ...form, testing_encounter_id: e.target.value })}>
                    <option value="">—</option>
                    {encounters.map((e) => <option key={e.id} value={e.id}>{e.client_ref || e.id.slice(0, 8)} · {e.encounter_date}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Facility (optional)</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Event date</label>
                  <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
