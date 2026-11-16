import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { fetchCoveredEntities, fetchFacilities, fetchPrescriptionIdsByRx, fetchExistingImportKeys, importRecords } from '../lib/api';
import { DATASETS, MAX_BYTES, MAX_ROWS, buildTemplate, parseCsv, validateRows } from '../lib/importer';

function friendlyError(err) {
  if (err.code === '42501') return 'You do not have permission to save this kind of data. Ask an organization admin.';
  return err.message;
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DataImport({ org, onNavigate }) {
  const [datasetKey, setDatasetKey] = useState('prescriptions');
  const [entities, setEntities] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [entityId, setEntityId] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null); // validation result
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  const dataset = DATASETS[datasetKey];

  useEffect(() => {
    let alive = true;
    (async () => {
      const [e, f] = await Promise.all([fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      if (!alive) return;
      setEntities(e);
      setFacilities(f);
      setEntityId((cur) => cur || e[0]?.id || '');
    })();
    return () => { alive = false; };
  }, [org.id]);

  function reset() {
    setFileName('');
    setParsed(null);
    setResult(null);
    setError('');
    setDone(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Re-check whenever the file, the dataset or the covered entity changes.
  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    (async () => {
      setChecking(true);
      setError('');
      try {
        const [prescriptions, existingKeys] = await Promise.all([
          dataset.columns.some((c) => c.lookup === 'prescription') ? fetchPrescriptionIdsByRx(org.id) : Promise.resolve(new Map()),
          fetchExistingImportKeys(datasetKey, org.id),
        ]);
        const facilityMap = new Map(facilities.map((f) => [f.name.toLowerCase(), f.id]));
        const r = validateRows(dataset, parsed, { orgId: org.id, coveredEntityId: entityId, facilities: facilityMap, prescriptions, existingKeys });
        if (alive) setResult(r);
      } catch (err) {
        if (alive) setError(friendlyError(err));
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, [parsed, datasetKey, entityId, facilities, org.id]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    setResult(null);
    setDone(null);
    setError('');
    if (!file) { setParsed(null); setFileName(''); return; }
    if (file.size > MAX_BYTES) { setError(`That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.`); setParsed(null); setFileName(''); return; }
    try {
      const text = await file.text();
      setFileName(file.name);
      setParsed(parseCsv(text));
    } catch (err) {
      setError(err.message);
      setParsed(null);
      setFileName('');
    }
  }

  async function handleImport() {
    if (!result || result.fatal || result.records.length === 0) return;
    setBusy(true);
    setError('');
    setProgress({ done: 0, total: result.records.length });
    try {
      const saved = await importRecords(dataset, result.records, (d, t) => setProgress({ done: d, total: t }));
      setDone({ saved, newCount: result.newCount, updateCount: result.updateCount, skipped: result.errors.length, label: dataset.label });
      setParsed(null);
      setResult(null);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const where = err.saved !== undefined
        ? ` ${err.saved.toLocaleString()} row${err.saved === 1 ? ' was' : 's were'} saved before the failure (rows ${err.failedFrom}–${err.failedTo} of the valid rows were not). Fix the problem and import the same file again; rows already saved are updated, not duplicated.`
        : '';
      setError(friendlyError(err) + where);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const canImport = useMemo(() => result && !result.fatal && result.records.length > 0 && !checking && !busy, [result, checking, busy]);
  const noEntities = entities.length === 0;

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Data Import</h2>
          <div className="toolbar-sub">Load prescriptions, dispensing, purchases and Medicare claims from CSV files, then run the analysis.</div>
        </div>
      </div>

      {done && (
        <div className="alert alert-info" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <strong>{done.saved.toLocaleString()} {done.label.toLowerCase()} saved</strong> ({done.newCount.toLocaleString()} new, {done.updateCount.toLocaleString()} updated{done.skipped ? `, ${done.skipped.toLocaleString()} rows skipped because of errors` : ''}).
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => onNavigate && onNavigate('reconcile')}>Run the analysis</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDone(null)}>Import another file</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><h3 style={{ margin: 0 }}>1. Choose what you are importing</h3></div>
        <div className="panel-body">
          <div className="inline-form">
            <div className="field">
              <label>Data type</label>
              <select value={datasetKey} onChange={(e) => { setDatasetKey(e.target.value); reset(); }}>
                {Object.entries(DATASETS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </div>
            {dataset.needsEntity && (
              <div className="field">
                <label>Covered entity these rows belong to</label>
                <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  {noEntities && <option value="">No covered entities yet</option>}
                  {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <p className="toolbar-sub" style={{ margin: '4px 0 12px' }}>{dataset.help}</p>
          <table>
            <thead><tr><th>Column</th><th>Required</th><th>Also accepted as</th></tr></thead>
            <tbody>
              {dataset.columns.map((c) => (
                <tr key={c.key}>
                  <td style={{ fontWeight: 600 }}>{c.key}</td>
                  <td>{c.required ? 'Yes' : c.def !== undefined ? `No (blank = ${String(c.def)})` : 'No'}</td>
                  <td style={{ color: 'var(--muted, #64748b)' }}>{(c.aliases || []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadText(`${datasetKey}-template.csv`, buildTemplate(dataset))}>
              <Download size={13} /> Download template
            </button>
          </div>
          <ul className="toolbar-sub" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
            <li>Dates: YYYY-MM-DD or MM/DD/YYYY. Up to {MAX_ROWS.toLocaleString()} rows and {MAX_BYTES / 1048576} MB per file.</li>
            <li>Spreadsheet programs drop leading zeros from NDCs. Save the NDC column as text, or keep the hyphens (11111-1111-1).</li>
            <li>Use an internal patient reference, never names, dates of birth or SSNs. Columns this page does not recognize are ignored and not stored.</li>
            <li>Importing the same file again is safe: rows with the same Rx number, fill ID, invoice line or claim number are updated, not duplicated. Only columns present in the file are changed.</li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h3 style={{ margin: 0 }}>2. Choose the file</h3></div>
        <div className="panel-body">
          <label className="btn btn-secondary" style={{ width: 'auto', display: 'inline-flex', gap: 8, cursor: 'pointer' }}>
            <Upload size={15} /> {fileName || 'Choose a CSV file'}
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          {parsed && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={reset}>Clear</button>}
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      {parsed && (
        <div className="panel">
          <div className="panel-header"><h3 style={{ margin: 0 }}>3. Check and import</h3></div>
          <div className="panel-body">
            {checking && <p>Checking {parsed.rows.length.toLocaleString()} rows…</p>}
            {result?.fatal && <div className="alert alert-error">{result.fatal}</div>}
            {result && !result.fatal && (
              <>
                <p style={{ marginTop: 0 }}>
                  <FileSpreadsheet size={15} style={{ verticalAlign: 'text-bottom' }} />{' '}
                  <strong>{result.records.length.toLocaleString()}</strong> of {parsed.rows.length.toLocaleString()} rows are ready:{' '}
                  <strong>{result.newCount.toLocaleString()}</strong> new, <strong>{result.updateCount.toLocaleString()}</strong> will update existing records.
                  {result.errors.length > 0 && <> <strong style={{ color: '#b91c1c' }}>{result.errors.length.toLocaleString()}</strong> rows have errors and will be skipped.</>}
                </p>
                <p className="toolbar-sub" style={{ marginTop: 0 }}>Columns used: {result.columnsUsed.join(', ')}</p>
                {result.unknownColumns.length > 0 && (
                  <div className="alert alert-info">Ignored columns (not stored): {result.unknownColumns.join(', ')}</div>
                )}
                {result.warnings.length > 0 && (
                  <div className="alert alert-info">
                    <strong>{result.warnings.length} repeated row{result.warnings.length === 1 ? '' : 's'}</strong> in the file; the later one is used.
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {result.warnings.slice(0, 5).map((w) => <li key={w.line}>Line {w.line}: {w.message}</li>)}
                      {result.warnings.length > 5 && <li>…and {result.warnings.length - 5} more</li>}
                    </ul>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <>
                    <h4 style={{ margin: '12px 0 6px' }}>Rows with errors{result.errors.length > 100 ? ' (first 100)' : ''}</h4>
                    <table>
                      <thead><tr><th style={{ width: 70 }}>Line</th><th>Problem</th></tr></thead>
                      <tbody>
                        {result.errors.slice(0, 100).map((er) => <tr key={er.line}><td>{er.line}</td><td>{er.message}</td></tr>)}
                      </tbody>
                    </table>
                  </>
                )}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!canImport} onClick={handleImport}>
                    {busy ? 'Importing…' : `Import ${result.records.length.toLocaleString()} rows`}
                  </button>
                  {progress && <span className="toolbar-sub">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} saved</span>}
                  {result.errors.length > 0 && !busy && <span className="toolbar-sub">Rows with errors are skipped. Fix them in the file and import again to add them.</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
