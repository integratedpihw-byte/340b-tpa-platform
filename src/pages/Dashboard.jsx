import React, { useEffect, useState } from 'react';
import { Building2, ScrollText } from 'lucide-react';
import { fetchDashboardKpis, fetchAuditLog, DASHBOARD_FILTERS as F } from '../lib/api';

function Tile({ label, value, sub, tone, onClick, loading }) {
  const color = tone === 'bad' && value > 0 ? '#b91c1c' : tone === 'warn' && value > 0 ? '#b45309' : undefined;
  return (
    <button type="button" className="stat-card" onClick={onClick} disabled={!onClick}
      style={{ textAlign: 'left', cursor: onClick ? 'pointer' : 'default', font: 'inherit' }}
      title={onClick ? 'Open the matching list' : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{loading ? '–' : value.toLocaleString()}</div>
      {sub && <div className="toolbar-sub">{loading ? ' ' : sub}</div>}
    </button>
  );
}

const money = (n) => `$${Math.round(n).toLocaleString()}`;

export default function Dashboard({ org, onNavigate }) {
  const [kpi, setKpi] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([fetchDashboardKpis(org.id), fetchAuditLog(org.id, { limit: 8 })])
      .then(([k, log]) => { if (!cancelled) { setKpi(k); setRecent(log); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
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

  const go = (view, filter) => () => onNavigate && onNavigate(view, filter || null);
  const k = kpi || {};

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>{org.name}</h2>
          <div className="toolbar-sub">{org.legal_name || 'No legal name on file'} · {org.status}</div>
        </div>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={go('reports')}>Reports</button>
      </div>

      {error && <div className="alert alert-error">Could not load the dashboard numbers: {error}</div>}

      <h3 style={{ margin: '4px 0 8px' }}>Needs attention</h3>
      <div className="stat-grid">
        <Tile loading={loading} tone="bad" label="Critical and high findings" value={k.criticalHigh || 0} sub="open" onClick={go('compliance-findings', F.criticalHigh)} />
        <Tile loading={loading} tone="warn" label="Open compliance findings" value={k.openFindings || 0} sub="all severities" onClick={go('compliance-findings', F.openFindings)} />
        <Tile loading={loading} tone="warn" label="Open claim exceptions" value={k.openExceptions || 0} onClick={go('exceptions', F.openExceptions)} />
        <Tile loading={loading} tone="warn" label="Dispensing records with an exception" value={k.dispensingExceptions || 0} onClick={go('dispensing', F.dispensingExceptions)} />
        <Tile loading={loading} label="Dispensing not yet reconciled" value={k.unreconciled || 0} sub="run the analysis to reconcile" onClick={go('dispensing', F.unreconciled)} />
        <Tile loading={loading} label="Prescriptions awaiting eligibility review" value={k.pendingReview || 0} onClick={go('prescriptions', F.pendingReview)} />
        <Tile loading={loading} label="Part B claims without the TB modifier" value={k.noTbModifier || 0} sub="all dates; the analysis checks 2025 on" onClick={go('medicare', F.noTbModifier)} />
      </div>

      <h3 style={{ margin: '20px 0 8px' }}>Opportunities</h3>
      <div className="stat-grid">
        <Tile loading={loading} label="Active opportunities" value={k.activeOpps || 0} sub={`${money(k.oppValue || 0)} estimated per year`} onClick={go('opportunities', F.activeOpportunities)} />
      </div>

      <h3 style={{ margin: '20px 0 8px' }}>Organization</h3>
      <div className="stat-grid">
        <Tile loading={loading} label="Covered entities" value={k.entities || 0} onClick={go('entities')} />
        <Tile loading={loading} label="Facilities" value={k.facilities || 0} onClick={go('facilities')} />
        <Tile loading={loading} label="Users" value={k.users || 0} onClick={go('users')} />
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
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
