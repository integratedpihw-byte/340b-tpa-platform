import React, { useEffect, useState } from 'react';
import { Play, ShieldAlert, Lightbulb, AlertOctagon, Database } from 'lucide-react';
import { fetchEngineOverview, fetchEngineRuns, runEngine } from '../lib/api';
import { RULES, SCOPES, ruleTitle } from '../lib/engineRules';

function friendlyError(err) {
  if (err.code === '42501') return 'Only users with permission to run the analysis can do this. Ask an organization admin.';
  return err.message;
}

function totalDetected(summary) {
  if (!summary) return 0;
  return ['findings', 'exceptions', 'opportunities'].reduce(
    (sum, k) => sum + Object.values(summary[k] || {}).reduce((s, v) => s + (v.detected || 0), 0), 0);
}

function ResultTable({ title, icon: Icon, data, goTo, onNavigate }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={15} /> {title}</h4>
      <table>
        <thead><tr><th>Check</th><th style={{ width: 90 }}>Detected</th><th style={{ width: 90 }}>New</th></tr></thead>
        <tbody>
          {entries.map(([code, v]) => (
            <tr key={code}>
              <td><span style={{ fontWeight: 600 }}>{ruleTitle(code)}</span> <span className="toolbar-sub">({code})</span></td>
              <td>{v.detected}</td>
              <td>{v.new}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {goTo && <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => onNavigate && onNavigate(goTo.view)}>{goTo.label}</button>}
    </div>
  );
}

export default function ReconciliationRisk({ org, onNavigate }) {
  const [overview, setOverview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [scope, setScope] = useState('all');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [o, r] = await Promise.all([fetchEngineOverview(org.id), fetchEngineRuns(org.id)]);
      setOverview(o);
      setRuns(r);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  useEffect(() => { setResult(null); load(); }, [org.id]);

  async function handleRun() {
    setRunning(true);
    setError('');
    try {
      const r = await runEngine(org.id, scope);
      setResult(r);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setRunning(false);
    }
  }

  const d = overview?.data;
  const o = overview?.open;
  const noData = d && d.prescriptions + d.dispensing + d.purchases + d.claims + d.contracts === 0;
  const grouped = Object.entries(RULES).reduce((acc, [code, r]) => { (acc[r.area] ||= []).push([code, r]); return acc; }, {});

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Reconciliation &amp; Risk</h2>
          <div className="toolbar-sub">Compare your records against each other and against 340B program rules. Results are leads for a person to review, not final determinations.</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 16 }}>
            {d && [
              ['Prescriptions', d.prescriptions], ['Dispensing records', d.dispensing], ['Purchase lines', d.purchases],
              ['Medicare claims', d.claims], ['Contract pharmacies', d.contracts],
            ].map(([label, n]) => (
              <div key={label}><div style={{ fontSize: 22, fontWeight: 700 }}>{n.toLocaleString()}</div><div className="toolbar-sub">{label}</div></div>
            ))}
          </div>
          {noData && (
            <div className="alert alert-info">
              There is no data to analyze yet. <button className="btn btn-secondary btn-sm" onClick={() => onNavigate && onNavigate('import')}>Import a CSV</button> or add records on the Operations pages.
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 260 }}>
              <label>What to check</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={running} onClick={handleRun}>
              <Play size={15} /> {running ? 'Running…' : 'Run analysis'}
            </button>
          </div>
          <p className="toolbar-sub" style={{ marginBottom: 0 }}>{SCOPES.find((s) => s.key === scope)?.help}. Running again never creates duplicates: an issue that is already logged is refreshed, and anything you resolved, marked false positive, waived or declined stays as you left it.</p>
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      {result && (
        <div className="panel">
          <div className="panel-header"><h3 style={{ margin: 0 }}>Results of this run</h3></div>
          <div className="panel-body">
            {totalDetected(result) === 0 && <div className="alert alert-info">Nothing was flagged by these checks.</div>}
            <ResultTable title="Compliance findings" icon={ShieldAlert} data={result.findings} goTo={{ view: 'compliance-findings', label: 'Open Compliance Findings' }} onNavigate={onNavigate} />
            <ResultTable title="Medicare claim exceptions" icon={AlertOctagon} data={result.exceptions} goTo={{ view: 'exceptions', label: 'Open Claims Exceptions' }} onNavigate={onNavigate} />
            <ResultTable title="Opportunities" icon={Lightbulb} data={result.opportunities} goTo={{ view: 'opportunities', label: 'Open Opportunities' }} onNavigate={onNavigate} />
            {(result.dispensing_marked_exception > 0 || result.dispensing_marked_matched > 0) && (
              <p className="toolbar-sub">Dispensing records updated: {result.dispensing_marked_exception} marked exception, {result.dispensing_marked_matched} marked matched.</p>
            )}
            {result.open_findings_no_longer_detected > 0 && (
              <div className="alert alert-info">
                {result.open_findings_no_longer_detected} open finding{result.open_findings_no_longer_detected === 1 ? '' : 's'} from earlier runs {result.open_findings_no_longer_detected === 1 ? 'was' : 'were'} not detected this time, so the underlying problem may be fixed. They stay open until you review and resolve them.
              </div>
            )}
          </div>
        </div>
      )}

      {o && (
        <div className="panel">
          <div className="panel-header"><h3 style={{ margin: 0 }}>Open items from the analysis</h3></div>
          <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {[['Critical', o.critical, 'compliance-findings'], ['High', o.high, 'compliance-findings'], ['Medium', o.medium, 'compliance-findings'], ['Low', o.low, 'compliance-findings'],
              ['Claim exceptions', o.exceptions, 'exceptions'], ['Opportunities', o.opportunities, 'opportunities']].map(([label, n, view]) => (
              <button key={label} className="btn btn-secondary" style={{ width: 'auto', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 14px' }} onClick={() => onNavigate && onNavigate(view)}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{n.toLocaleString()}</span>
                <span className="toolbar-sub">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><h3 style={{ margin: 0 }}>Recent runs</h3></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {runs.length === 0 ? (
            <div className="empty-state"><Database size={28} /><p>The analysis has not been run yet.</p></div>
          ) : (
            <table>
              <thead><tr><th>When</th><th>Checked</th><th>Issues detected</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.started_at).toLocaleString()}</td>
                    <td>{SCOPES.find((s) => s.key === r.run_type)?.label || r.run_type}</td>
                    <td>{totalDetected(r.summary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h3 style={{ margin: 0 }}>What the analysis checks</h3></div>
        <div className="panel-body">
          {Object.entries(grouped).map(([area, items]) => (
            <details key={area} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{area} ({items.length})</summary>
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Check</th><th>How it works</th><th>Why it matters</th></tr></thead>
                <tbody>
                  {items.map(([code, r]) => (
                    <tr key={code}>
                      <td style={{ fontWeight: 600 }}>{r.title}<div className="toolbar-sub">{code}</div></td>
                      <td>{r.how}</td>
                      <td>{r.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          <p className="toolbar-sub" style={{ marginBottom: 0 }}>State Medicaid rules, the full duplicate-discount comparison against the HRSA Medicaid Exclusion File, and Medicare modifier edge cases (for example drugs that are not separately payable) are not automated yet. These checks are a starting screen, not a substitute for your compliance program or an independent audit.</p>
        </div>
      </div>
    </div>
  );
}
