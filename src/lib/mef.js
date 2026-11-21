// Reading a Medicaid Exclusion File (MEF) that was downloaded from the HRSA 340B OPAIS site and saved as CSV.
// Pure functions, so they can be tested in Node.
//
// HRSA does not publish a formal column list for the download. Columns are found by name, and the page shows
// which columns were used so a person can check. Two rules matter:
//  * "Medicaid State" is the state billed. A plain "State" column is the state where the entity is located,
//    so it is never used as the billing state.
//  * Only rows for this organization's own 340B IDs are kept. The rest of the national file is discarded.

import { parseCsv, normalizeHeader } from './importer.js';

export const MEF_MAX_BYTES = 25 * 1024 * 1024; // the national file is large; it is read in the browser and filtered
export const MEF_MAX_KEPT_ROWS = 2000;

const FIELDS = [
  { key: 'opais_id', required: true, names: ['340b_id', '340b_id_number', '340bid', 'id_340b', 'opais_id', 'covered_entity_340b_id'] },
  { key: 'medicaid_state', required: true, names: ['medicaid_state', 'medicaid_billing_state', 'state_billed', 'billing_state'] },
  { key: 'medicaid_provider_number', names: ['medicaid_provider_number', 'medicaid_provider_no', 'medicaid_provider_id', 'medicaid_number', 'medicaid_billing_number'] },
  { key: 'npi', names: ['npi', 'npi_number', 'medicaid_npi', 'billing_npi'] },
  { key: 'entity_name', names: ['entity_name', 'covered_entity_name', 'organization_name', 'name'] },
];

function mapColumns(headers) {
  const map = {};
  const used = new Set();
  for (const f of FIELDS) {
    const i = headers.findIndex((h, idx) => f.names.includes(h) && !used.has(idx));
    if (i >= 0) { map[f.key] = i; used.add(i); }
  }
  return map;
}

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function normalizeOpaisId(v) {
  return clean(v).toUpperCase();
}

// text: file contents. ownIds: the organization's 340B IDs (covered_entities.opais_id).
export function readMefCsv(text, ownIds) {
  const out = { fatal: null, headerLine: null, columns: {}, totalRows: 0, rows: [], skippedBadState: 0, notInFile: [], truncated: false };
  const own = new Set([...ownIds].map(normalizeOpaisId).filter(Boolean));
  if (own.size === 0) {
    out.fatal = 'None of your covered entities has a 340B ID yet. Add the 340B ID on the Covered Entities page first, then upload the file.';
    return out;
  }

  let parsed;
  try { parsed = parseCsv(text); } catch (e) { out.fatal = e.message; return out; }
  if (parsed.headers.length === 0) { out.fatal = 'The file is empty.'; return out; }

  // the header is normally the first row; allow a few title rows above it
  const candidates = [{ headers: parsed.headers, rows: parsed.rows, skip: 0 }];
  for (let skip = 1; skip <= 8 && skip <= parsed.rows.length; skip++) {
    candidates.push({ headers: parsed.rows[skip - 1].cells.map(normalizeHeader), rows: parsed.rows.slice(skip), skip });
  }
  let chosen = null;
  let map = null;
  for (const c of candidates) {
    const m = mapColumns(c.headers);
    if (m.opais_id !== undefined && m.medicaid_state !== undefined) { chosen = c; map = m; break; }
  }
  if (!chosen) {
    const first = mapColumns(parsed.headers);
    const missing = [];
    if (first.opais_id === undefined) missing.push('a 340B ID column');
    if (first.medicaid_state === undefined) missing.push('a "Medicaid State" column');
    out.fatal = `This does not look like a Medicaid Exclusion File: it has no ${missing.join(' and ')}. Download the file from 340B OPAIS (Reports/Files), save it as CSV, and try again. A column that is only called "State" is the entity's own state and cannot be used.`;
    return out;
  }

  out.headerLine = chosen.skip === 0 ? 1 : chosen.skip + 1;
  out.columns = Object.fromEntries(Object.entries(map).map(([k, i]) => [k, chosen.headers[i]]));
  out.totalRows = chosen.rows.length;

  const seenIds = new Set();
  const kept = new Set();
  for (const r of chosen.rows) {
    const id = normalizeOpaisId(r.cells[map.opais_id]);
    if (!id || !own.has(id)) continue;
    seenIds.add(id);
    const state = clean(r.cells[map.medicaid_state]).toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) { out.skippedBadState++; continue; }
    const row = {
      opais_id: id,
      medicaid_state: state,
      medicaid_provider_number: map.medicaid_provider_number !== undefined ? clean(r.cells[map.medicaid_provider_number]) : '',
      npi: map.npi !== undefined ? clean(r.cells[map.npi]) : '',
      entity_name: map.entity_name !== undefined ? clean(r.cells[map.entity_name]) : '',
    };
    const key = [row.opais_id, row.medicaid_state, row.medicaid_provider_number, row.npi].join('|');
    if (kept.has(key)) continue;
    kept.add(key);
    if (out.rows.length >= MEF_MAX_KEPT_ROWS) { out.truncated = true; break; }
    out.rows.push(row);
  }
  out.notInFile = [...own].filter((id) => !seenIds.has(id)).sort();
  return out;
}

// ---------- quarters ----------

export function quarterStart(date) {
  const d = new Date(date);
  const m = Math.floor(d.getUTCMonth() / 3) * 3;
  return `${d.getUTCFullYear()}-${String(m + 1).padStart(2, '0')}-01`;
}

export function quarterLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

// previous, current and next quarter (the next quarter's file is published before that quarter begins)
export function quarterOptions(today = new Date()) {
  const cur = quarterStart(today);
  const [y, m] = cur.split('-').map(Number);
  const shift = (n) => {
    const total = y * 12 + (m - 1) + n * 3;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
  };
  return [shift(-1), cur, shift(1)].map((value) => ({ value, label: quarterLabel(value), current: value === cur }));
}

export const MEF_STATUS_LABELS = {
  matched: 'Consistent with the file',
  not_listed: 'Carve-in but not listed',
  number_mismatch: 'Listed, number differs',
  listed_but_carve_out: 'Carve-out but listed',
  no_340b_id: 'No 340B ID',
  no_state: 'No state',
  method_missing: 'No carve-in/out choice',
  no_file: 'No file uploaded',
};

export const MEF_PROBLEM_STATUSES = ['not_listed', 'number_mismatch', 'listed_but_carve_out'];
