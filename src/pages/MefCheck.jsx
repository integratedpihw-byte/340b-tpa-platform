import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileCheck2, Upload } from 'lucide-react';
import { applyMefComparison, fetchCoveredEntities, fetchMefComparison, fetchMefFiles, replaceMefEntries } from '../lib/api';
import { MEF_MAX_BYTES, MEF_PROBLEM_STATUSES, MEF_STATUS_LABELS, quarterLabel, quarterOptions, readMefCsv } from '../lib/mef';

function StatusBadge({ status }) {
  const cls = status === 'matched' ? 'badge-good' : MEF_PROBLEM_STATUSES.includes(status) ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{MEF_STATUS_LABELS[status] || status}</span>;
}

export default function MefCheck({ org }) {
  const quarters = useMemo(() => quarterOptions(), []);
  const [quarter, setQuarter] = useState(quarters.find((q) => q.current).value);
  const [entities, setEntities] = useState([]);
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fileName, setFileName] = useState('');
  const [read, setRead] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [e, f, c] = await Promise.all([fetchCoveredEntities(org.id), fetchMefFiles(org.id), fetchMefComparison(org.id)]);
      setEntities(e);
      setFiles(f);
      setRows(c);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [org.id]);

  function reset() {
    setRead(null);
    setFileName('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    setRead(null);
    setError('');
    setNotice('');
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setError('This is an Excel file. Open it in Excel, choose File → Save As → CSV, and upload the CSV.');
      return;
    }
    if (file.size > MEF_MAX_BYTES) {
      setError(`The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MEF_MAX_BYTES / 1048576} MB.`);
      return;
    }
    const text = await file.text();
    if (text.startsWith('PK')) {
      setError('This looks like an Excel workbook, not a CSV. Save it as CSV from Excel and try again.');
      return;
    }
    const result = readMefCsv(text, entities.map((x) => x.opais_id));
    if (result.fatal) setError(result.fatal);
    else setRead(result);
  }

  async function handleSave() {
    if (!read) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const n = await replaceMefEntries(org.id, quarter, read.rows, fileName);
      setNotice(`Saved ${n} listing${n === 1 ? '' : 's'} for ${quarterLabel(quarter)}. The comparison below is up to date.`);
      reset();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleApply() {
    setBusy('apply');
    setError('');
    setNotice('');
    try {
      const n = await applyMefComparison(org.id);
      setNotice(`Updated the MEF status on ${n} enrollment${n === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const latest = files[0];
  const counts = useMemo(() => {
    const c = { total: rows.length, problems: 0, matched: 0, other: 0 };
    for (const r of rows) {
      if (r.status === 'matched') c.matched++;
      else if (MEF_PROBLEM_STATUSES.includes(r.status)) c.problems++;
      else c.other++;
    }
    return c;
  }, [rows]);
  const comparable = rows.filter((r) => ['matched', ...MEF_PROBLEM_STATUSES].includes(r.status)).length;

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Medicaid Exclusion File check</h2>
          <div className="toolbar-sub">
            Compares your carve-in / carve-out choices and billing numbers with the HRSA Medicaid Exclusion File. The file covers Medicaid fee-for-service only, not managed care.
          </div>
        </div>
      </div>

      {loadError && <div className="alert alert-error">Could not load: {loadError}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="panel">
        <div className="panel-header"><h2>1. Upload the quarterly file</h2></div>
        <div className="panel-body">
          <p className="toolbar-sub" style={{ marginTop: 0, lineHeight: 1.6 }}>
            In 340B OPAIS open <strong>Reports/Files → Medicaid Exclusion Files</strong>, download the quarter you want, open it in Excel and save it as CSV.
            The file is read in your browser; only the rows for your own 340B IDs are kept and saved here.
          </p>
          <div className="inline-form" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label>Quarter the file covers</label>
              <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                {quarters.map((q) => <option key={q.value} value={q.value}>{q.label}{q.current ? ' (current)' : ''}</option>)}
              </select>
            </div>
            <div className="field">
              <label style={{ visibility: 'hidden' }}>File</label>
              <label className="btn btn-secondary" style={{ width: 'auto', display: 'inline-flex', gap: 8, cursor: 'pointer' }}>
                <Upload size={15} /> {fileName || 'Choose a CSV file'}
                <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
          {entities.length > 0 && entities.every((x) => !x.opais_id) && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>None of your covered entities has a 340B ID yet. Add it on the Covered Entities page first.</div>
          )}
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

          {read && (
            <div style={{ marginTop: 16 }}>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-label">Rows in the file</div><div className="stat-value">{read.totalRows.toLocaleString('en-US')}</div></div>
                <div className="stat-card"><div className="stat-label">Rows for your 340B IDs</div><div className="stat-value">{read.rows.length.toLocaleString('en-US')}</div></div>
              </div>
              <div className="toolbar-sub" style={{ lineHeight: 1.6 }}>
                Columns used: {Object.entries(read.columns).map(([k, v]) => `${k.replace(/_/g, ' ')} ← "${v}"`).join('; ')}.
                {read.headerLine > 1 && ` The header is on line ${read.headerLine}.`}
              </div>
              {read.skippedBadState > 0 && <div className="alert alert-info" style={{ marginTop: 8 }}>{read.skippedBadState} row(s) for your IDs were skipped because the Medicaid state was not a two-letter code.</div>}
              {read.truncated && <div className="alert alert-error" style={{ marginTop: 8 }}>Only the first 2,000 listings were kept. Check that the file belongs to you.</div>}
              {read.notInFile.length > 0 && (
                <div className="alert alert-info" style={{ marginTop: 8 }}>
                  Not in the file: {read.notInFile.join(', ')}. That is expected for an entity that carves out Medicaid; for a carve-in entity it means it is not listed.
                </div>
              )}
              <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }} disabled={busy === 'save'} onClick={handleSave}>
                {busy === 'save' ? 'Saving…' : `Save for ${quarterLabel(quarter)}`}
              </button>
              <span className="toolbar-sub" style={{ marginLeft: 12 }}>Replaces anything already saved for that quarter.</span>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ flex: 1 }}>2. Comparison</h2>
          {latest && <span className="toolbar-sub">Latest file: {quarterLabel(latest.quarter_start)}, saved {new Date(latest.uploaded_at).toLocaleDateString()}</span>}
          <button className="btn btn-secondary btn-sm" disabled={busy === 'apply' || comparable === 0} onClick={handleApply}>
            <CheckCircle2 size={13} /> {busy === 'apply' ? 'Saving…' : 'Copy results to enrollments'}
          </button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state"><FileCheck2 size={28} /><p>No active Medicaid enrollments to compare. Add them on the Medicaid Enrollments page.</p></div>
          ) : (
            <>
              {rows.length > 0 && (
                <div style={{ padding: '12px 16px' }} className="toolbar-sub">
                  {counts.total} enrollment{counts.total === 1 ? '' : 's'}: {counts.matched} consistent, {counts.problems} to review{counts.other ? `, ${counts.other} that cannot be compared yet` : ''}.
                  Compared by the 340B ID on each covered entity, using the latest saved file; a site with its own separate 340B ID is not compared.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Covered entity</th><th>340B ID</th><th>State</th><th>Billing number</th><th>Recorded as</th><th>Result</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.enrollment_id}>
                        <td style={{ fontWeight: 600 }}>{r.entity_label}</td>
                        <td>{r.opais_id || '—'}</td>
                        <td>{r.state || '—'}</td>
                        <td>{r.enrollment_number || '—'}</td>
                        <td>{r.billing_method === 'carve_in' ? 'Carve-in' : r.billing_method === 'carve_out' ? 'Carve-out' : '—'}</td>
                        <td><StatusBadge status={r.status} /><div className="toolbar-sub" style={{ marginTop: 4, maxWidth: 420 }}>{r.detail}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="toolbar-sub" style={{ lineHeight: 1.6 }}>
        <strong>Good to know.</strong> HRSA takes its snapshot at 12:01 a.m. ET on the 16th of the month before each quarter. A change requested now takes effect from the first day of the following quarter, and only if HRSA approves it before the snapshot; HRSA generally does not change a published file retroactively.
        A carve-out site should not be listed. Run the analysis on the Reconciliation &amp; Risk page to turn these results into findings.
      </div>
    </div>
  );
}
