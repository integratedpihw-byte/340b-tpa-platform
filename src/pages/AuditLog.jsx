import React, { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { fetchAuditLog } from '../lib/api';

export default function AuditLog({ org }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  async function load(action) {
    setLoading(true);
    try {
      setRows(await fetchAuditLog(org.id, { action: action || undefined, limit: 200 }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function handleSearch(e) {
    e.preventDefault();
    load(filter);
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Audit Log</h2>
          <div className="toolbar-sub">Every write to a tenant-scoped table, mirrored automatically.</div>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by action, e.g. facilities.update"
            style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', minWidth: 240 }}
          />
          <button className="btn btn-secondary" style={{ width: 'auto' }} type="submit"><Search size={14} /></button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <ScrollText size={28} />
              <p>No matching activity.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Record</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><code className="mono">{row.action}</code></td>
                    <td>{row.target_table}</td>
                    <td><code className="mono">{row.target_id ? row.target_id.slice(0, 8) : '—'}</code></td>
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
