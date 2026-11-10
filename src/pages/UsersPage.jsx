import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Copy } from 'lucide-react';
import { fetchOrgUsers, fetchRoles, fetchFacilities, updateUser } from '../lib/api';

export default function UsersPage({ org }) {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [u, r, f] = await Promise.all([fetchOrgUsers(org.id), fetchRoles(org.id), fetchFacilities(org.id)]);
      setRows(u);
      setRoles(r);
      setFacilities(f);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  async function handleRoleChange(user, roleId) {
    await updateUser(user.id, { role_id: roleId || null });
    await load();
  }

  async function handleFacilityChange(user, facilityId) {
    await updateUser(user.id, { facility_id: facilityId || null });
    await load();
  }

  async function handleStatusToggle(user) {
    const next = user.status === 'active' ? 'disabled' : 'active';
    await updateUser(user.id, { status: next });
    await load();
  }

  function copyOrgId() {
    navigator.clipboard?.writeText(org.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Users</h2>
          <div className="toolbar-sub">Everyone with access to {org.name}.</div>
        </div>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={copyOrgId}>
          <Copy size={14} /> {copied ? 'Copied org ID' : 'Copy org ID to invite'}
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <UsersIcon size={28} />
              <p>No one has joined this organization yet.</p>
              <p style={{ fontSize: 12.5 }}>Share the org ID above — a new teammate signs up, then joins with it.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Facility</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.email}</td>
                    <td>
                      <select value={u.role_id || ''} onChange={(e) => handleRoleChange(u, e.target.value)}>
                        <option value="">No role</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={u.facility_id || ''} onChange={(e) => handleFacilityChange(u, e.target.value)}>
                        <option value="">—</option>
                        {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td><span className={`badge ${u.status === 'active' ? 'badge-good' : u.status === 'invited' ? 'badge-warn' : 'badge-bad'}`}>{u.status}</span></td>
                    <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleStatusToggle(u)}>
                        {u.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
