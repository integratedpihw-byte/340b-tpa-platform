import React, { useEffect, useState } from 'react';
import { Plus, UserCog, X, Trash2 } from 'lucide-react';
import { fetchCounselorAssignments, fetchOrgUsers, fetchTestingSites, createCounselorAssignment, updateCounselorAssignment, deleteCounselorAssignment } from '../lib/api';

const emptyForm = { user_id: '', testing_site_id: '', assigned_at: '', status: 'active' };

export default function CounselorAssignments({ org }) {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [a, u, s] = await Promise.all([fetchCounselorAssignments(org.id), fetchOrgUsers(org.id), fetchTestingSites(org.id)]);
      setRows(a);
      setUsers(u);
      setSites(s);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, user_id: users[0]?.id || '', testing_site_id: sites[0]?.id || '', assigned_at: new Date().toISOString().slice(0, 10) });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      user_id: row.user_id,
      testing_site_id: row.testing_site_id,
      assigned_at: row.assigned_at,
      status: row.status,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.user_id || !form.testing_site_id) { setError('A user and a testing site are both required.'); return; }
    setBusy(true);
    setError('');
    try {
      if (editing) await updateCounselorAssignment(editing.id, form);
      else await createCounselorAssignment({ ...form, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this assignment?')) return;
    await deleteCounselorAssignment(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Counselor Assignments</h2>
          <div className="toolbar-sub">Who covers which testing site, for performance reporting.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New assignment
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <UserCog size={28} />
              <p>No assignments yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Counselor</th>
                  <th>Testing site</th>
                  <th>Assigned</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.users?.email || '—'}</td>
                    <td>{row.testing_sites?.facilities?.name || '—'}</td>
                    <td>{row.assigned_at}</td>
                    <td><span className={`badge ${row.status === 'active' ? 'badge-good' : 'badge-neutral'}`}>{row.status}</span></td>
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
              <h3>{editing ? 'Edit assignment' : 'New assignment'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Counselor</label>
                  <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Testing site</label>
                  <select value={form.testing_site_id} onChange={(e) => setForm({ ...form, testing_site_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.facilities?.name}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Assigned on</label>
                    <input type="date" value={form.assigned_at} onChange={(e) => setForm({ ...form, assigned_at: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="ended">Ended</option>
                    </select>
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
