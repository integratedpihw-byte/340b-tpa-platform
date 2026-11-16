import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FileDown, FileSpreadsheet, Lock } from 'lucide-react';
import { fetchCanSeeAllHivPerformance, fetchHivPerformance } from '../lib/api';
import {
  EXPORT_COLUMNS, GROUPINGS, MIN_DENOMINATOR, defaultRange, exportRows, pct, withRates,
} from '../lib/hivMetrics';
import { csvBlob, downloadBlob, fileStamp, slugify, toXlsx, XLSX_MIME } from '../lib/exporters';

const SMALL = `Fewer than ${MIN_DENOMINATOR}`;

function Rate({ value, count, denominator }) {
  if (value === null) {
    return <span className="toolbar-sub" title={`${SMALL} people in this group, so no rate is shown`}>—</span>;
  }
  return <span title={denominator !== undefined ? `${count} of ${denominator}` : undefined}>{pct(value)}</span>;
}

export default function HivPerformance({ org }) {
  const initial = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [group, setGroup] = useState('site');
  const [state, setState] = useState({ status: 'loading', rows: [], error: '', denied: false });
  const [seesAll, setSeesAll] = useState(null);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCanSeeAllHivPerformance().then((v) => { if (!cancelled) setSeesAll(v); });
    return () => { cancelled = true; };
  }, [org.id]);

  useEffect(() => {
    let cancelled = false;
    if (!from || !to) return undefined;
    setState((s) => ({ ...s, status: 'loading', error: '', denied: false }));
    fetchHivPerformance(org.id, from, to, group)
      .then((data) => { if (!cancelled) setState({ status: 'ready', rows: data.map(withRates), error: '', denied: false }); })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', rows: [], error: err.message, denied: err.code === '42501' });
      });
    return () => { cancelled = true; };
  }, [org.id, from, to, group]);

  const { rows, status } = state;
  // Add up the counts for the summary tiles and the total line.
  const totals = useMemo(() => {
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    return {
      tests: sum('tests'), positives: sum('positives'), negatives: sum('negatives'),
      positivesAssessable: sum('positivesAssessable'), linked30Count: sum('linked30Count'),
      art30Count: sum('art30Count'), lostToFollowUp: sum('lostToFollowUp'),
    };
  }, [rows]);

  const grouping = GROUPINGS.find((g) => g.key === group);
  const rangeInvalid = !from || !to || from > to;
  const showTotals = group !== 'overall' && rows.length > 1;

  async function handleExport(kind) {
    setExporting(kind);
    try {
      const data = exportRows(rows);
      const base = `hiv-performance-${group}-${fileStamp()}`;
      if (kind === 'csv') downloadBlob(csvBlob(EXPORT_COLUMNS, data), `${base}.csv`);
      else {
        const meta = [
          ['Report', 'HIV program performance'],
          ['Organization', org.name],
          ['Grouping', grouping.label],
          ['Encounter dates', `${from} to ${to}`],
          ['Scope', seesAll ? 'All counselors and sites' : 'Only encounters conducted by the person who exported this'],
          ['Rates', `Shown only when the group has at least ${MIN_DENOMINATOR} people in the denominator; blank otherwise.`],
          ['Linkage and ART', 'Count only positives whose test was at least 30 days ago. Within 30 days of the test date.'],
          ['Generated', new Date().toLocaleString()],
          ['Handling', 'Contains HIV program information. Share only with people who need it.'],
        ];
        downloadBlob(new Blob([await toXlsx('HIV performance', EXPORT_COLUMNS, data, meta)], { type: XLSX_MIME }), `${slugify(base)}.xlsx`);
      }
    } catch (err) {
      setState((s) => ({ ...s, error: `Export failed: ${err.message}` }));
    } finally {
      setExporting('');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>HIV Program Performance</h2>
          <div className="toolbar-sub">
            {seesAll === false
              ? 'Showing only the tests you conducted yourself.'
              : 'Testing, risk screening, PrEP referral and linkage to care, by site, counselor or month.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={!!exporting || status !== 'ready' || rows.length === 0} onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet size={13} /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!!exporting || status !== 'ready' || rows.length === 0} onClick={() => handleExport('csv')}>
            <FileDown size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          <div className="inline-form" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label>From</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>To</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="field">
              <label>Group by</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
          </div>
          {rangeInvalid && <div className="alert alert-error" style={{ marginTop: 12 }}>Choose a start date that is on or before the end date.</div>}
        </div>
      </div>

      {state.denied && (
        <div className="alert alert-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Lock size={16} /> Your role does not include access to HIV program records. Ask an organization administrator if you need it.
        </div>
      )}
      {state.error && !state.denied && <div className="alert alert-error">{state.error}</div>}

      {status === 'loading' && !rangeInvalid && <div className="toolbar-sub" style={{ padding: 12 }}>Loading…</div>}

      {status === 'ready' && rows.length === 0 && (
        <div className="panel"><div className="empty-state"><Activity size={26} /><p>No testing encounters in this date range.</p></div></div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Tests</div><div className="stat-value">{totals.tests.toLocaleString('en-US')}</div></div>
            <div className="stat-card"><div className="stat-label">Positive results</div><div className="stat-value">{totals.positives.toLocaleString('en-US')}</div></div>
            <div className="stat-card"><div className="stat-label">Linked within 30 days</div><div className="stat-value">{totals.positivesAssessable >= MIN_DENOMINATOR ? pct(totals.linked30Count / totals.positivesAssessable) : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Lost to follow-up</div><div className="stat-value">{totals.lostToFollowUp.toLocaleString('en-US')}</div></div>
          </div>

          <div className="panel">
            <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{grouping.first}</th>
                    <th style={{ textAlign: 'right' }}>Tests</th>
                    <th style={{ textAlign: 'right' }}>Positive</th>
                    <th style={{ textAlign: 'right' }}>Positivity</th>
                    <th style={{ textAlign: 'right' }}>Risk screening</th>
                    <th style={{ textAlign: 'right' }}>PrEP referral</th>
                    <th style={{ textAlign: 'right' }}>Linked in 30 days</th>
                    <th style={{ textAlign: 'right' }}>ART in 30 days</th>
                    <th style={{ textAlign: 'right' }}>Median days to visit</th>
                    <th style={{ textAlign: 'right' }}>Lost to follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td style={{ textAlign: 'right' }}>{r.tests.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right' }}>{r.positives.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right' }}><Rate value={r.positivity} /></td>
                      <td style={{ textAlign: 'right' }}><Rate value={r.riskScreeningRate} /></td>
                      <td style={{ textAlign: 'right' }}><Rate value={r.prepReferralRate} /></td>
                      <td style={{ textAlign: 'right' }}><Rate value={r.linkage30} count={r.linked30Count} denominator={r.positivesAssessable} /></td>
                      <td style={{ textAlign: 'right' }}><Rate value={r.art30} count={r.art30Count} denominator={r.positivesAssessable} /></td>
                      <td style={{ textAlign: 'right' }}>{r.medianDaysToAttend === null ? '—' : r.medianDaysToAttend}</td>
                      <td style={{ textAlign: 'right' }}>{r.lostToFollowUp.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                  {showTotals && (
                    <tr style={{ fontWeight: 600 }}>
                      <td>All shown</td>
                      <td style={{ textAlign: 'right' }}>{totals.tests.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right' }}>{totals.positives.toLocaleString('en-US')}</td>
                      <td colSpan={5} />
                      <td />
                      <td style={{ textAlign: 'right' }}>{totals.lostToFollowUp.toLocaleString('en-US')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="toolbar-sub" style={{ lineHeight: 1.6 }}>
            <strong>How to read this.</strong> Positivity is positives out of tests with a final positive or negative result. Risk screening is out of all tests.
            PrEP referral is out of negative tests. Linkage and ART rates count only positives tested at least 30 days ago, so recent positives do not lower the rate;
            linkage means a first attended visit within 30 days of the test, and a visit dated before the test is ignored. A dash means the group has fewer than {MIN_DENOMINATOR} people,
            too few for a meaningful rate; the counts are still shown. Figures come from the records entered in this platform and have not been compared with any external benchmark.
          </div>
        </>
      )}
    </div>
  );
}
