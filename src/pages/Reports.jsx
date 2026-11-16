import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Play, Table2 } from 'lucide-react';
import { REPORTS, reportByKey, filtersText, totalsText } from '../lib/reports';
import { csvBlob, downloadBlob, fileStamp, PDF_MAX_ROWS, toPdf, toXlsx, XLSX_MIME } from '../lib/exporters';

const PREVIEW_ROWS = 100;
const GROUPS = ['Compliance', 'Operations', 'Payers', 'Financial'];

function show(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (col.type === 'bool') return v ? 'Yes' : 'No';
  if (col.type === 'money') return `${Number(v) < 0 ? '-' : ''}$${Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (col.type === 'datetime') return new Date(v).toLocaleString();
  if (col.type === 'number') return Number(v).toLocaleString('en-US');
  return String(v);
}

export default function Reports({ org }) {
  const [key, setKey] = useState(REPORTS[0].key);
  const [filters, setFilters] = useState({});
  const [result, setResult] = useState(null); // { reportKey, filters, rows, at }
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const report = reportByKey(key);
  const stale = result && (result.reportKey !== key || JSON.stringify(result.filters) !== JSON.stringify(filters));
  const current = result && result.reportKey === key ? result : null;

  function choose(k) {
    setKey(k);
    setFilters({});
    setResult(null);
    setError('');
    setNotice('');
  }

  async function handleRun() {
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const rows = await report.run(org.id, clean);
      setResult({ reportKey: key, filters: clean, rows, at: new Date() });
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const meta = useMemo(() => {
    if (!current) return [];
    const m = [
      ['Report', report.title],
      ['Organization', org.name],
      ['Filters', filtersText(report, current.filters)],
      ['Rows', current.rows.length.toLocaleString('en-US')],
    ];
    const totals = totalsText(report, current.rows);
    if (totals) m.push(['Totals', totals]);
    m.push(['Generated', `${current.at.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`]);
    m.push(['Source', '340B TPA Platform']);
    m.push(['Handling', 'Contains operational records. Share only with people who need them.']);
    return m;
  }, [current, report, org.name]);

  async function handleExport(kind) {
    if (!current) return;
    setExporting(kind);
    setError('');
    setNotice('');
    try {
      const base = `${report.key}-${fileStamp()}`;
      if (kind === 'csv') downloadBlob(csvBlob(report.columns, current.rows), `${base}.csv`);
      else if (kind === 'xlsx') downloadBlob(new Blob([await toXlsx(report.title, report.columns, current.rows, meta)], { type: XLSX_MIME }), `${base}.xlsx`);
      else {
        const { bytes, truncated } = await toPdf(report.title, report.columns, current.rows, meta);
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${base}.pdf`);
        if (truncated) setNotice(`The PDF has the first ${PDF_MAX_ROWS.toLocaleString()} of ${current.rows.length.toLocaleString()} rows. Use Excel or CSV for everything.`);
      }
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting('');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Reports</h2>
          <div className="toolbar-sub">Run a report, then download it as Excel, CSV or PDF. Reports show only what your role can see. Patient references and HIV program records are never included.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-body" style={{ padding: 8 }}>
            {GROUPS.map((g) => (
              <div key={g} style={{ marginBottom: 8 }}>
                <div className="sidebar-section-label" style={{ color: 'var(--ink-soft)', padding: '6px 8px' }}>{g}</div>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <button key={r.key} className={`nav-item ${r.key === key ? 'active' : ''}`} style={{ width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => choose(r.key)}>
                    <Table2 size={14} /> {r.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-header"><h3 style={{ margin: 0 }}>{report.title}</h3></div>
            <div className="panel-body">
              <p className="toolbar-sub" style={{ marginTop: 0 }}>{report.description}</p>
              {report.filters.length > 0 && (
                <div className="inline-form" style={{ flexWrap: 'wrap' }}>
                  {report.filters.map((f) => (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      {f.type === 'select' ? (
                        <select value={filters[f.key] || ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}>
                          <option value="">All</option>
                          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : (
                        <input type="date" value={filters[f.key] || ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={running} onClick={handleRun}>
                <Play size={15} /> {running ? 'Running…' : 'Run report'}
              </button>
              {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
            </div>
          </div>

          {current && (
            <div className="panel">
              <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, flex: 1 }}>{current.rows.length.toLocaleString()} row{current.rows.length === 1 ? '' : 's'}</h3>
                <button className="btn btn-secondary btn-sm" disabled={!!exporting || stale} onClick={() => handleExport('xlsx')}><FileSpreadsheet size={13} /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}</button>
                <button className="btn btn-secondary btn-sm" disabled={!!exporting || stale} onClick={() => handleExport('csv')}><FileDown size={13} /> CSV</button>
                <button className="btn btn-secondary btn-sm" disabled={!!exporting || stale} onClick={() => handleExport('pdf')}><FileText size={13} /> {exporting === 'pdf' ? 'Preparing…' : 'PDF'}</button>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {stale && <div className="alert alert-info" style={{ margin: 12 }}>The filters changed. Run the report again before downloading.</div>}
                {notice && <div className="alert alert-info" style={{ margin: 12 }}>{notice}</div>}
                {totalsText(report, current.rows) && <div style={{ padding: '10px 16px', fontWeight: 600 }}>{totalsText(report, current.rows)}</div>}
                {current.rows.length === 0 ? (
                  <div className="empty-state"><Table2 size={26} /><p>No records match.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead><tr>{report.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                      <tbody>
                        {current.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                          <tr key={i}>{report.columns.map((c) => (
                            <td key={c.key} style={{ textAlign: c.type === 'money' || c.type === 'number' ? 'right' : undefined, maxWidth: 360 }}>{show(c, r[c.key])}</td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {current.rows.length > PREVIEW_ROWS && <div className="toolbar-sub" style={{ padding: 12 }}>Showing the first {PREVIEW_ROWS} rows. Downloads include all {current.rows.length.toLocaleString()}.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
