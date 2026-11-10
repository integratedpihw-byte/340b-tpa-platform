import React, { useEffect, useState } from 'react';
import { Building2, ScrollText } from 'lucide-react';
import { fetchCoveredEntities, fetchFacilities, fetchOrgUsers, fetchAuditLog } from '../lib/api';

export default function Dashboard({ org }) {
  const [counts, setCounts] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchCoveredEntities(org.id),
      fetchFacilities(org.id),
      fetchOrgUsers(org.id),
      fetchAuditLog(org.id, { limit: 8 }),
    ])
      .then(([entities, facilities, users, log]) => {
        if (cancelled) return;
        setCounts({ entities: entities.length, facilities: facilities.length, users: users.length });
        setRecent(log);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [org]);

  if (!org) {
    return (
      <div className="empty-state">
        <Building2 size={28} />
        <p>No organization selected yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>{org.name}</h2>
          <div className="toolbar-sub">{org.legal_name || 'No legal name on file'} · {org.status}</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Covered entities</div>
          <div className="stat-value">{loading ? '–' : counts.entities}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Facilities</div>
          <div className="stat-value">{loading ? '–' : counts.facilities}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Users</div>
          <div className="stat-value">{loading ? '–' : counts.users}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recent audit activity</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {recent.length === 0 ? (
            <div className="empty-state">
              <ScrollText size={24} />
              <p>No activity recorded yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Table</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td><code className="mono">{row.action}</code></td>
                    <td>{row.target_table}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
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
