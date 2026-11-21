// CSV import: parsing, column mapping and row validation. Pure functions (no network),
// so the same code can be tested in Node. The page handles files, lookups and saving.

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

// ---------- CSV parsing (RFC 4180: quotes, doubled quotes, embedded newlines, BOM) ----------

function detectDelimiter(text) {
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break;
      if (ch in counts) counts[ch]++;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

export function parseCsv(input) {
  const text = String(input).replace(/^﻿/, '');
  const delim = detectDelimiter(text);
  const records = []; // { line, cells }
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let sawContent = false;

  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') { inQuotes = true; sawContent = true; continue; }
    if (ch === delim) { endCell(); sawContent = true; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
      continue;
    }
    cell += ch;
    sawContent = true;
  }
  if (inQuotes) throw new Error('The file has an opening quote that is never closed. Check the last quoted value.');
  if (sawContent || cell !== '' || cells.length) endRecord();

  if (records.length === 0) return { headers: [], rows: [], delimiter: delim };
  const headers = records[0].cells.map(normalizeHeader);
  return { headers, rows: records.slice(1), delimiter: delim };
}

export function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ---------- value parsers (each throws Error with a plain-language message) ----------

const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const clean = (v) => String(v).trim();

export const parsers = {
  text: (v) => clean(v),

  ndc: (v) => {
    const s = clean(v);
    const digits = s.replace(/\D/g, '');
    if (!/^[0-9-]+$/.test(s) || (digits.length !== 10 && digits.length !== 11)) {
      throw new Error(`"${s}" is not an NDC (expected 10 or 11 digits, hyphens allowed)`);
    }
    return s;
  },

  npi: (v) => {
    const s = clean(v);
    if (!/^\d{10}$/.test(s)) throw new Error(`"${s}" is not a 10-digit NPI`);
    return s;
  },

  number: (v) => {
    const s = clean(v).replace(/[$,\s]/g, '');
    const n = Number(s);
    if (s === '' || !Number.isFinite(n)) throw new Error(`"${clean(v)}" is not a number`);
    if (n < 0) throw new Error(`"${clean(v)}" must not be negative`);
    return n;
  },

  bool: (v) => {
    const s = clean(v).toLowerCase();
    if (['true', 'yes', 'y', '1', 'x', 'tb'].includes(s)) return true;
    if (['false', 'no', 'n', '0', 'jg', 'none'].includes(s)) return false;
    throw new Error(`"${clean(v)}" is not yes/no`);
  },

  // plain yes/no (unlike bool, "JG" means yes here, for columns that record whether a JG modifier was used)
  yesno: (v) => {
    const s = clean(v).toLowerCase();
    if (['true', 'yes', 'y', '1', 'x', 'jg'].includes(s)) return true;
    if (['false', 'no', 'n', '0', 'none'].includes(s)) return false;
    throw new Error(`"${clean(v)}" is not yes/no`);
  },

  // two-letter US state or territory code, upper-cased
  state: (v) => {
    const s = clean(v).toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) throw new Error(`"${clean(v)}" is not a two-letter state code (for example OH)`);
    return s;
  },

  // calendar date -> YYYY-MM-DD
  date: (v) => toIsoDate(clean(v)),

  // timestamp column; a bare date becomes noon UTC so it shows the same day in every US time zone
  datetime: (v) => {
    const s = clean(v);
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
      const d = new Date(s.replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) throw new Error(`"${s}" is not a valid date and time`);
      return d.toISOString();
    }
    return `${toIsoDate(s)}T12:00:00Z`;
  },
};

function toIsoDate(s) {
  let y, m, d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (match) { [, y, m, d] = match; }
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { [, m, d, y] = match; }
  else throw new Error(`"${s}" is not a date (use YYYY-MM-DD or MM/DD/YYYY)`);
  y = Number(y); m = Number(m); d = Number(d);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) {
    throw new Error(`"${s}" is not a real date`);
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function enumOf(values, labelForError) {
  return (v) => {
    const s = clean(v).toLowerCase().replace(/[\s-]+/g, '_');
    if (values.includes(s)) return s;
    throw new Error(`"${clean(v)}" is not a valid ${labelForError} (use: ${values.join(', ')})`);
  };
}

// ---------- the datasets ----------
// key: column name stored in the database (or a lookup key). aliases: other header names accepted.
// def: value used when the column is present but the cell is blank.

export const DATASETS = {
  prescriptions: {
    label: 'Prescriptions',
    table: 'prescriptions',
    conflict: 'org_id,rx_number',
    needsEntity: true,
    keyOf: (r) => r.rx_number,
    help: 'One row per prescription. Re-importing the same Rx number updates it instead of adding a duplicate. Optional payer_type (medicaid_ffs, medicaid_mco, medicare_b, medicare_d, commercial, uninsured, other) and medicaid_state feed the Medicaid checks.',
    columns: [
      { key: 'rx_number', required: true, parse: parsers.text, aliases: ['rx', 'rx_no', 'rx_id', 'prescription_number', 'prescription_id'], example: 'RX-100234' },
      { key: 'drug_name', required: true, parse: parsers.text, aliases: ['drug', 'medication'], example: 'Biktarvy 50/200/25 mg' },
      { key: 'ndc', parse: parsers.ndc, example: '61958-2501-1' },
      { key: 'quantity', parse: parsers.number, aliases: ['qty', 'quantity_prescribed'], example: '30' },
      { key: 'patient_ref', parse: parsers.text, aliases: ['patient_id', 'patient_reference', 'mrn'], example: 'PT-48213' },
      { key: 'prescriber_npi', parse: parsers.npi, aliases: ['npi', 'prescriber'], example: '1234567893' },
      { key: 'eligibility_status', parse: enumOf(['eligible', 'ineligible', 'pending_review'], 'eligibility status'), def: 'pending_review', aliases: ['eligibility'], example: 'eligible' },
      { key: 'status', parse: enumOf(['prescribed', 'dispensed', 'reversed', 'void'], 'prescription status'), def: 'prescribed', example: 'dispensed' },
      { key: 'payer_type', parse: enumOf(['medicaid_ffs', 'medicaid_mco', 'medicare_b', 'medicare_d', 'commercial', 'uninsured', 'other'], 'payer'), aliases: ['payer'], example: 'medicaid_ffs' },
      { key: 'medicaid_state', parse: parsers.state, aliases: ['state', 'billing_state'], example: 'OH' },
      { key: 'prescribed_at', parse: parsers.datetime, aliases: ['prescribed_date', 'written_date', 'date'], example: '2026-09-14' },
      { key: 'facility', lookup: 'facility', target: 'facility_id', parse: parsers.text, aliases: ['facility_name', 'clinic'], example: 'Main Street Clinic' },
    ],
  },

  dispensing: {
    label: 'Dispensing records',
    table: 'dispensing_records',
    conflict: 'org_id,external_ref',
    needsEntity: false,
    keyOf: (r) => r.external_ref,
    help: 'One row per fill. Each fill needs its own unique ID from your pharmacy system, plus the Rx number of the prescription it belongs to (import prescriptions first).',
    columns: [
      { key: 'external_ref', required: true, parse: parsers.text, aliases: ['dispense_id', 'fill_id', 'claim_id', 'transaction_id', 'id'], example: 'FILL-889120' },
      { key: 'rx_number', required: true, lookup: 'prescription', target: 'prescription_id', parse: parsers.text, aliases: ['rx', 'rx_no', 'rx_id', 'prescription_number'], example: 'RX-100234' },
      { key: 'ndc', parse: parsers.ndc, aliases: ['ndc_dispensed'], example: '61958-2501-1' },
      { key: 'quantity_dispensed', parse: parsers.number, aliases: ['quantity', 'qty', 'qty_dispensed'], example: '30' },
      { key: 'lot_number', parse: parsers.text, aliases: ['lot'], example: 'L2309A' },
      { key: 'pricing_tier', parse: enumOf(['340b', 'wac', 'gpo', 'other'], 'pricing tier'), aliases: ['price_tier', 'account', 'inventory_type'], example: '340b' },
      { key: 'claim_340b_identified', parse: parsers.bool, def: false, aliases: ['340b_identified', 'claim_340b', 'scc_20'], example: 'no' },
      { key: 'dispensed_at', parse: parsers.datetime, aliases: ['dispensed_date', 'fill_date', 'date'], example: '2026-09-15' },
      { key: 'facility', lookup: 'facility', target: 'facility_id', parse: parsers.text, aliases: ['pharmacy', 'facility_name', 'pharmacy_name'], example: 'Corner Drug Contract Pharmacy' },
    ],
  },

  purchases: {
    label: 'Purchase invoices',
    table: 'purchase_orders',
    conflict: 'org_id,invoice_number,ndc',
    needsEntity: true,
    keyOf: (r) => `${r.invoice_number}|${r.ndc}`,
    help: 'One row per invoice line (invoice number + NDC). Rows are saved as received unless you give a status. Used to compare 340B purchases against 340B dispensing.',
    columns: [
      { key: 'invoice_number', required: true, parse: parsers.text, aliases: ['invoice', 'invoice_no', 'po_number', 'order_number'], example: 'INV-55120' },
      { key: 'ndc', required: true, parse: parsers.ndc, example: '61958-2501-1' },
      { key: 'drug_name', required: true, parse: parsers.text, aliases: ['drug', 'item', 'description'], example: 'Biktarvy 50/200/25 mg' },
      { key: 'quantity_ordered', parse: parsers.number, aliases: ['quantity', 'qty', 'units'], example: '120' },
      { key: 'unit_cost', parse: parsers.number, aliases: ['cost', 'price', 'unit_price'], example: '31.42' },
      { key: 'status', parse: enumOf(['draft', 'submitted', 'received', 'cancelled'], 'order status'), def: 'received', example: 'received' },
      { key: 'ordered_at', parse: parsers.datetime, aliases: ['order_date', 'invoice_date'], example: '2026-08-30' },
      { key: 'received_at', parse: parsers.datetime, aliases: ['received_date', 'delivery_date'], example: '2026-09-02' },
    ],
  },

  medicare: {
    label: 'Medicare claims',
    table: 'medicare_claims',
    conflict: 'org_id,claim_number',
    needsEntity: true,
    keyOf: (r) => r.claim_number,
    help: 'One row per claim line. The Rx number links a claim to its prescription (recommended, needed for the 340B modifier check). Mark tb_modifier_applied yes or no ("TB" counts as yes). Use jg_modifier_applied for the older JG modifier, separately_payable = no for packaged drugs, and identifier_340b_applied for Part D claims that carried a 340B code.',
    columns: [
      { key: 'claim_number', required: true, parse: parsers.text, aliases: ['claim', 'claim_no', 'claim_id', 'icn'], example: 'CLM-7730012' },
      { key: 'part', required: true, parse: (v) => { const s = clean(v).toUpperCase().replace(/^PART\s*/, ''); if (s === 'B' || s === 'D') return s; throw new Error(`"${clean(v)}" is not Medicare part B or D`); }, aliases: ['medicare_part'], example: 'B' },
      { key: 'claim_date', required: true, parse: parsers.date, aliases: ['date_of_service', 'dos', 'service_date', 'date'], example: '2026-09-15' },
      { key: 'rx_number', lookup: 'prescription', target: 'prescription_id', parse: parsers.text, aliases: ['rx', 'rx_no', 'prescription_number'], example: 'RX-100234' },
      { key: 'tb_modifier_applied', parse: parsers.bool, def: false, aliases: ['tb_modifier', 'modifier', '340b_modifier'], example: 'yes' },
      { key: 'jg_modifier_applied', parse: parsers.yesno, def: false, aliases: ['jg_modifier', 'jg'], example: 'no' },
      { key: 'separately_payable', parse: parsers.yesno, def: true, aliases: ['separately_payable_drug'], example: 'yes' },
      { key: 'identifier_340b_applied', parse: parsers.yesno, def: false, aliases: ['340b_identifier', 'scc_20'], example: 'no' },
      { key: 'ndc', parse: parsers.ndc, example: '61958-2501-1' },
      { key: 'drug_name', parse: parsers.text, aliases: ['drug', 'description'], example: 'Biktarvy 50/200/25 mg' },
      { key: 'billed_amount', parse: parsers.number, aliases: ['billed', 'charge'], example: '1840.00' },
      { key: 'allowed_amount', parse: parsers.number, aliases: ['allowed', 'paid_amount'], example: '1522.50' },
      { key: 'status', parse: enumOf(['submitted', 'paid', 'denied', 'adjusted'], 'claim status'), def: 'submitted', example: 'paid' },
      { key: 'facility', lookup: 'facility', target: 'facility_id', parse: parsers.text, aliases: ['facility_name', 'pharmacy'], example: 'Main Street Clinic' },
    ],
  },
};

// ---------- header mapping ----------

export function mapHeaders(dataset, headers) {
  const used = new Set();
  const mapping = []; // { col, index }
  const missingRequired = [];
  for (const col of dataset.columns) {
    const names = [col.key, ...(col.aliases || [])];
    const index = headers.findIndex((h, i) => names.includes(h) && !used.has(i));
    if (index >= 0) { used.add(index); mapping.push({ col, index }); }
    else if (col.required) missingRequired.push(col.key);
  }
  const unknown = headers.filter((h, i) => !used.has(i) && h !== '');
  return { mapping, missingRequired, unknown };
}

// ---------- validation ----------
// ctx.facilities: Map(lowercase name -> id); ctx.prescriptions: Map(rx_number -> id)
// ctx.existingKeys: Set of keys already in the database (for the new/update split)

export function validateRows(dataset, parsed, { orgId, coveredEntityId, facilities = new Map(), prescriptions = new Map(), existingKeys = new Set() }) {
  const out = { records: [], errors: [], warnings: [], unknownColumns: [], columnsUsed: [], fatal: null, newCount: 0, updateCount: 0 };

  if (parsed.headers.length === 0) { out.fatal = 'The file is empty.'; return out; }
  const { mapping, missingRequired, unknown } = mapHeaders(dataset, parsed.headers);
  out.unknownColumns = unknown;
  out.columnsUsed = mapping.map((m) => m.col.key);
  if (missingRequired.length) {
    out.fatal = `Required column${missingRequired.length > 1 ? 's' : ''} missing: ${missingRequired.join(', ')}. Download the template to see the expected columns.`;
    return out;
  }
  if (parsed.rows.length === 0) { out.fatal = 'The file has a header row but no data rows.'; return out; }
  if (parsed.rows.length > MAX_ROWS) { out.fatal = `The file has ${parsed.rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()} per file. Split it and import in parts.`; return out; }
  if (dataset.needsEntity && !coveredEntityId) { out.fatal = 'Choose the covered entity these rows belong to.'; return out; }

  const seen = new Map(); // key -> index in out.records
  for (const row of parsed.rows) {
    const rec = { org_id: orgId };
    if (dataset.needsEntity) rec.covered_entity_id = coveredEntityId;
    const problems = [];

    for (const { col, index } of mapping) {
      const raw = row.cells[index];
      let value;
      if (blank(raw)) {
        if (col.required) { problems.push(`${col.key} is empty`); continue; }
        value = col.def !== undefined ? col.def : null;
      } else {
        try { value = col.parse(raw); } catch (e) { problems.push(`${col.key}: ${e.message}`); continue; }
      }

      if (col.lookup === 'facility') {
        if (value === null) { rec.facility_id = null; continue; }
        const id = facilities.get(String(value).toLowerCase());
        if (!id) { problems.push(`facility: no facility named "${value}" (names must match the Facilities page)`); continue; }
        rec.facility_id = id;
      } else if (col.lookup === 'prescription') {
        if (value === null) { rec.prescription_id = null; continue; }
        const id = prescriptions.get(String(value));
        if (!id) { problems.push(`rx_number: no prescription "${value}" found (import prescriptions first)`); continue; }
        rec.prescription_id = id;
      } else {
        rec[col.key] = value;
      }
    }

    if (problems.length) { out.errors.push({ line: row.line, message: problems.join('; ') }); continue; }

    const key = dataset.keyOf(rec);
    if (seen.has(key)) {
      const prev = seen.get(key);
      out.warnings.push({ line: row.line, message: `Repeats "${key}" from line ${prev.line}; the later row is used.` });
      out.records[prev.idx] = rec;
      seen.set(key, { idx: prev.idx, line: row.line });
    } else {
      seen.set(key, { idx: out.records.length, line: row.line });
      out.records.push(rec);
    }
  }

  for (const rec of out.records) {
    if (existingKeys.has(dataset.keyOf(rec))) out.updateCount++; else out.newCount++;
  }
  return out;
}

// ---------- templates ----------

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildTemplate(dataset) {
  const headers = dataset.columns.map((c) => c.key);
  const example = dataset.columns.map((c) => c.example ?? '');
  return [headers, example].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function templateColumnsSummary(dataset) {
  return dataset.columns.map((c) => ({ key: c.key, required: !!c.required, def: c.def, aliases: c.aliases || [] }));
}
