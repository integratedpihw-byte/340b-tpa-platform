// Report catalog. Each report reads through the signed-in user's access (row-level security), so a user
// only ever exports what they can already see. Patient references are deliberately not included, and HIV
// program records are not available here.
import { supabase } from './supabaseClient';
import { fetchAllRows } from './api';
import { entityLabel } from './labels';

const pretty = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const a = Date.UTC(...today().split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

// Applies an optional from/to date range. For timestamp columns the "to" day is included.
function dateRange(q, col, filters, isTimestamp = false) {
  if (filters.from) q = q.gte(col, filters.from);
  if (filters.to) {
    if (isTimestamp) {
      const next = new Date(`${filters.to}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      q = q.lt(col, next.toISOString().slice(0, 10));
    } else q = q.lte(col, filters.to);
  }
  return q;
}

const pick = (q, filters, keys) => { for (const k of keys) if (filters[k]) q = q.eq(k, filters[k]); return q; };

const DATE_FILTERS = (label = 'Date') => [
  { key: 'from', label: `${label} from`, type: 'date' },
  { key: 'to', label: `${label} to`, type: 'date' },
];
const opts = (...vals) => vals.map((v) => [v, pretty(v)]);
const SOURCE = { key: 'source', label: 'Source', type: 'select', options: [['engine', 'Auto-detected'], ['manual', 'Entered by hand']] };
const srcLabel = (s) => (s === 'engine' ? 'Auto-detected' : 'Manual');

export const REPORTS = [
  {
    key: 'findings', title: 'Compliance findings register', group: 'Compliance',
    description: 'Every compliance finding with severity, status, source and resolution.',
    filters: [
      { key: 'status', label: 'Status', type: 'select', options: opts('open', 'remediation_in_progress', 'resolved', 'false_positive') },
      { key: 'severity', label: 'Severity', type: 'select', options: opts('critical', 'high', 'medium', 'low') },
      SOURCE, ...DATE_FILTERS('Discovered'),
    ],
    columns: [
      { key: 'discovered_date', label: 'Discovered', type: 'date' }, { key: 'entity', label: 'Covered entity', type: 'text' },
      { key: 'facility', label: 'Facility', type: 'text' }, { key: 'finding_type', label: 'Type', type: 'text' },
      { key: 'severity', label: 'Severity', type: 'text' }, { key: 'status', label: 'Status', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' }, { key: 'rule_code', label: 'Rule', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' }, { key: 'resolved_date', label: 'Resolved', type: 'date' },
      { key: 'resolution_notes', label: 'Resolution notes', type: 'text' },
    ],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => dateRange(pick(supabase.from('compliance_findings')
        .select('*, covered_entities(name, entity_type, opais_id), facilities(name)').eq('org_id', orgId), f, ['status', 'severity', 'source']), 'discovered_date', f).order('discovered_date', { ascending: false }).order('id'));
      return rows.map((r) => ({
        discovered_date: r.discovered_date, entity: entityLabel(r.covered_entities), facility: r.facilities?.name || '',
        finding_type: pretty(r.finding_type), severity: pretty(r.severity), status: pretty(r.status), source: srcLabel(r.source),
        rule_code: r.rule_code || '', description: r.description || '', resolved_date: r.resolved_date, resolution_notes: r.resolution_notes || '',
      }));
    },
  },
  {
    key: 'exceptions', title: 'Claims exceptions', group: 'Compliance',
    description: 'Medicare claim exceptions such as missing 340B modifiers and duplicate discounts.',
    filters: [
      { key: 'status', label: 'Status', type: 'select', options: opts('open', 'resolved', 'waived') },
      { key: 'exception_type', label: 'Type', type: 'select', options: opts('duplicate_discount', 'missing_modifier', 'eligibility_mismatch', 'pricing_discrepancy', 'other') },
      SOURCE, ...DATE_FILTERS('Logged'),
    ],
    columns: [
      { key: 'created_at', label: 'Logged', type: 'datetime' }, { key: 'exception_type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' }, { key: 'claim_number', label: 'Claim number', type: 'text' },
      { key: 'drug', label: 'Drug', type: 'text' }, { key: 'source', label: 'Source', type: 'text' },
      { key: 'rule_code', label: 'Rule', type: 'text' }, { key: 'description', label: 'Description', type: 'text' },
      { key: 'resolved_at', label: 'Resolved', type: 'datetime' },
    ],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => dateRange(pick(supabase.from('claims_exceptions')
        .select('*, medicare_claims(claim_number, drug_name)').eq('org_id', orgId), f, ['status', 'exception_type', 'source']), 'created_at', f, true).order('created_at', { ascending: false }).order('id'));
      return rows.map((r) => ({
        created_at: r.created_at, exception_type: pretty(r.exception_type), status: pretty(r.status),
        claim_number: r.medicare_claims?.claim_number || '', drug: r.medicare_claims?.drug_name || '', source: srcLabel(r.source),
        rule_code: r.rule_code || '', description: r.description || '', resolved_at: r.resolved_at,
      }));
    },
  },
  {
    key: 'opportunities', title: 'Opportunity pipeline', group: 'Compliance',
    description: 'Savings and recapture opportunities with estimated annual value and owner.',
    filters: [{ key: 'status', label: 'Status', type: 'select', options: opts('identified', 'evaluating', 'pursuing', 'implemented', 'declined') }, SOURCE],
    columns: [
      { key: 'identified_date', label: 'Identified', type: 'date' }, { key: 'entity', label: 'Covered entity', type: 'text' },
      { key: 'opportunity_type', label: 'Type', type: 'text' }, { key: 'status', label: 'Status', type: 'text' },
      { key: 'value', label: 'Estimated annual value', type: 'money' }, { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' }, { key: 'description', label: 'Description', type: 'text' },
    ],
    totals: ['value'],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => pick(supabase.from('opportunities')
        .select('*, covered_entities(name, entity_type, opais_id), users(email)').eq('org_id', orgId), f, ['status', 'source']).order('identified_date', { ascending: false }).order('id'));
      return rows.map((r) => ({
        identified_date: r.identified_date, entity: entityLabel(r.covered_entities), opportunity_type: pretty(r.opportunity_type),
        status: pretty(r.status), value: r.estimated_annual_value, owner: r.users?.email || '', source: srcLabel(r.source), description: r.description || '',
      }));
    },
  },
  {
    key: 'dispensing', title: 'Dispensing reconciliation', group: 'Operations',
    description: 'Dispensing records with pricing tier, reconciliation status and the prescription eligibility behind each.',
    filters: [
      { key: 'reconciliation_status', label: 'Reconciliation', type: 'select', options: opts('unreconciled', 'matched', 'exception') },
      { key: 'pricing_tier', label: 'Pricing tier', type: 'select', options: [['340b', '340B'], ['wac', 'WAC'], ['gpo', 'GPO'], ['other', 'Other']] },
      ...DATE_FILTERS('Dispensed'),
    ],
    columns: [
      { key: 'dispensed_at', label: 'Dispensed', type: 'datetime' }, { key: 'rx_number', label: 'Rx number', type: 'text' },
      { key: 'drug', label: 'Drug', type: 'text' }, { key: 'ndc', label: 'NDC', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'lot', label: 'Lot', type: 'text' },
      { key: 'pricing_tier', label: 'Pricing tier', type: 'text' }, { key: 'facility', label: 'Facility', type: 'text' },
      { key: 'reconciliation', label: 'Reconciliation', type: 'text' }, { key: 'eligibility', label: 'Rx eligibility', type: 'text' },
    ],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => dateRange(pick(supabase.from('dispensing_records')
        .select('*, prescriptions(rx_number, drug_name, eligibility_status), facilities(name)').eq('org_id', orgId), f, ['reconciliation_status', 'pricing_tier']), 'dispensed_at', f, true).order('dispensed_at', { ascending: false }).order('id'));
      return rows.map((r) => ({
        dispensed_at: r.dispensed_at, rx_number: r.prescriptions?.rx_number || '', drug: r.prescriptions?.drug_name || '', ndc: r.ndc || '',
        quantity: r.quantity_dispensed, lot: r.lot_number || '', pricing_tier: r.pricing_tier === '340b' ? '340B' : (r.pricing_tier || '').toUpperCase(),
        facility: r.facilities?.name || '', reconciliation: pretty(r.reconciliation_status), eligibility: pretty(r.prescriptions?.eligibility_status),
      }));
    },
  },
  {
    key: 'ndc-balance', title: '340B purchases vs dispensing by drug', group: 'Operations',
    description: 'Per covered entity and NDC: units received on purchase orders against units dispensed at 340B pricing. A negative balance can mean missing purchases, or stock on hand before the first recorded purchase.',
    filters: [],
    columns: [
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'ndc', label: 'NDC (digits)', type: 'text' }, { key: 'drug', label: 'Drug', type: 'text' },
      { key: 'purchased', label: 'Units received', type: 'number' }, { key: 'dispensed', label: 'Units dispensed at 340B', type: 'number' },
      { key: 'balance', label: 'Balance', type: 'number' }, { key: 'flag', label: 'Review', type: 'text' },
    ],
    async run(orgId) {
      const [pos, disp, ents] = await Promise.all([
        fetchAllRows(() => supabase.from('purchase_orders').select('covered_entity_id, ndc, drug_name, quantity_ordered').eq('org_id', orgId).eq('status', 'received').order('id')),
        fetchAllRows(() => supabase.from('dispensing_records').select('ndc, quantity_dispensed, prescriptions(covered_entity_id, drug_name)').eq('org_id', orgId).eq('pricing_tier', '340b').order('id')),
        fetchAllRows(() => supabase.from('covered_entities').select('id, name, entity_type, opais_id').eq('org_id', orgId).order('id')),
      ]);
      const label = new Map(ents.map((e) => [e.id, entityLabel(e)]));
      const m = new Map();
      const slot = (ce, ndc, drug) => {
        const k = `${ce}|${digits(ndc)}`;
        if (!m.has(k)) m.set(k, { entity: label.get(ce) || '', ndc: digits(ndc), drug: drug || '', purchased: 0, dispensed: 0 });
        const s = m.get(k); if (!s.drug && drug) s.drug = drug; return s;
      };
      for (const p of pos) if (p.ndc) slot(p.covered_entity_id, p.ndc, p.drug_name).purchased += Number(p.quantity_ordered || 0);
      for (const d of disp) if (d.ndc && d.prescriptions) slot(d.prescriptions.covered_entity_id, d.ndc, d.prescriptions.drug_name).dispensed += Number(d.quantity_dispensed || 0);
      return [...m.values()].map((s) => ({ ...s, balance: s.purchased - s.dispensed, flag: s.dispensed > s.purchased ? 'Dispensed more than received' : '' }))
        .sort((a, b) => a.balance - b.balance);
    },
  },
  {
    key: 'medicare', title: 'Medicare claims and the 340B modifier', group: 'Payers',
    description: 'Medicare claims with billed and allowed amounts and whether the TB (340B) modifier is recorded.',
    filters: [
      { key: 'part', label: 'Part', type: 'select', options: [['B', 'Part B'], ['D', 'Part D']] },
      { key: 'tb', label: '340B (TB) modifier', type: 'select', options: [['yes', 'Applied'], ['no', 'Not applied']] },
      { key: 'status', label: 'Status', type: 'select', options: opts('submitted', 'paid', 'denied', 'adjusted') },
      ...DATE_FILTERS('Claim date'),
    ],
    columns: [
      { key: 'claim_date', label: 'Claim date', type: 'date' }, { key: 'claim_number', label: 'Claim number', type: 'text' },
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'part', label: 'Part', type: 'text' },
      { key: 'drug', label: 'Drug', type: 'text' }, { key: 'ndc', label: 'NDC', type: 'text' },
      { key: 'tb', label: 'TB modifier', type: 'bool' }, { key: 'billed', label: 'Billed', type: 'money' },
      { key: 'allowed', label: 'Allowed', type: 'money' }, { key: 'status', label: 'Status', type: 'text' },
    ],
    totals: ['billed', 'allowed'],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => {
        let q = pick(supabase.from('medicare_claims').select('*, covered_entities(name, entity_type, opais_id)').eq('org_id', orgId), f, ['part', 'status']);
        if (f.tb) q = q.eq('tb_modifier_applied', f.tb === 'yes');
        return dateRange(q, 'claim_date', f).order('claim_date', { ascending: false }).order('id');
      });
      return rows.map((r) => ({
        claim_date: r.claim_date, claim_number: r.claim_number || '', entity: entityLabel(r.covered_entities), part: `Part ${r.part}`,
        drug: r.drug_name || '', ndc: r.ndc || '', tb: r.tb_modifier_applied, billed: r.billed_amount, allowed: r.allowed_amount, status: pretty(r.status),
      }));
    },
  },
  {
    key: 'reconciliations', title: 'Payer reconciliation summaries', group: 'Payers',
    description: 'Results of payer reconciliations: claims checked, matched and with exceptions.',
    filters: [{ key: 'payer_type', label: 'Payer', type: 'select', options: opts('medicare', 'medicaid', 'commercial', 'other') }],
    columns: [
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'payer', label: 'Payer', type: 'text' },
      { key: 'period_start', label: 'Period start', type: 'date' }, { key: 'period_end', label: 'Period end', type: 'date' },
      { key: 'total', label: 'Claims', type: 'number' }, { key: 'matched', label: 'Matched', type: 'number' },
      { key: 'exceptions', label: 'Exceptions', type: 'number' }, { key: 'status', label: 'Status', type: 'text' },
    ],
    totals: ['total', 'matched', 'exceptions'],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => pick(supabase.from('payer_reconciliations').select('*, covered_entities(name, entity_type, opais_id)').eq('org_id', orgId), f, ['payer_type']).order('period_end', { ascending: false }).order('id'));
      return rows.map((r) => ({ entity: entityLabel(r.covered_entities), payer: pretty(r.payer_type), period_start: r.period_start, period_end: r.period_end, total: r.total_claims, matched: r.matched_claims, exceptions: r.exception_count, status: pretty(r.status) }));
    },
  },
  {
    key: 'contracts', title: 'Contract pharmacy audit status', group: 'Compliance',
    description: 'Active contract pharmacies and whether the quarterly internal and annual independent audits HRSA recommends are up to date.',
    filters: [{ key: 'status', label: 'Contract status', type: 'select', options: opts('active', 'pending', 'terminated') }],
    columns: [
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'pharmacy', label: 'Pharmacy', type: 'text' }, { key: 'status', label: 'Status', type: 'text' },
      { key: 'start', label: 'Contract start', type: 'date' }, { key: 'end', label: 'Contract end', type: 'date' },
      { key: 'internal', label: 'Last internal audit', type: 'date' }, { key: 'internal_due', label: 'Internal audit due', type: 'bool' },
      { key: 'independent', label: 'Last independent audit', type: 'date' }, { key: 'independent_due', label: 'Independent audit due', type: 'bool' },
    ],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => pick(supabase.from('pharmacy_contracts').select('*, covered_entities(name, entity_type, opais_id), facilities(name)').eq('org_id', orgId), f, ['status']).order('created_at', { ascending: false }).order('id'));
      return rows.map((r) => {
        const active = r.status === 'active';
        const di = daysUntil(r.last_internal_audit_date), dd = daysUntil(r.last_independent_audit_date);
        return {
          entity: entityLabel(r.covered_entities), pharmacy: r.facilities?.name || '', status: pretty(r.status), start: r.contract_start_date, end: r.contract_end_date,
          internal: r.last_internal_audit_date, internal_due: active && (di === null || di < -92),
          independent: r.last_independent_audit_date, independent_due: active && (dd === null || dd < -365),
        };
      });
    },
  },
  {
    key: 'recertification', title: 'Covered entity recertification', group: 'Compliance',
    description: 'Recertification dates, days remaining and Medicaid billing method for every covered entity.',
    filters: [],
    columns: [
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'type', label: 'Type', type: 'text' }, { key: 'opais', label: 'OPAIS ID', type: 'text' },
      { key: 'medicaid', label: 'Medicaid billing', type: 'text' }, { key: 'recert', label: 'Recertification date', type: 'date' },
      { key: 'days', label: 'Days remaining', type: 'number' }, { key: 'status', label: 'Status', type: 'text' },
    ],
    async run(orgId) {
      const rows = await fetchAllRows(() => supabase.from('covered_entities').select('*').eq('org_id', orgId).order('recertification_date', { ascending: true, nullsFirst: false }).order('id'));
      return rows.map((r) => ({ entity: entityLabel(r), type: pretty(r.entity_type), opais: r.opais_id || '', medicaid: pretty(r.medicaid_billing_method), recert: r.recertification_date, days: daysUntil(r.recertification_date), status: pretty(r.status) }));
    },
  },
  {
    key: 'documents', title: 'Documents and expiry', group: 'Compliance',
    description: 'Compliance documents with expiry dates and whether they are expired or expiring within 30 days.',
    filters: [{ key: 'expiry', label: 'Expiry', type: 'select', options: [['expired', 'Expired'], ['soon', 'Expiring within 30 days'], ['ok', 'Current'], ['none', 'No expiry date']] }],
    columns: [
      { key: 'title', label: 'Title', type: 'text' }, { key: 'document_type', label: 'Type', type: 'text' }, { key: 'owner', label: 'Entity / facility', type: 'text' },
      { key: 'expires', label: 'Expires', type: 'date' }, { key: 'days', label: 'Days remaining', type: 'number' }, { key: 'expiry', label: 'Expiry status', type: 'text' },
    ],
    async run(orgId, f) {
      const rows = await fetchAllRows(() => supabase.from('documents').select('*, covered_entities(name, entity_type, opais_id), facilities(name)').eq('org_id', orgId).order('expires_at', { ascending: true, nullsFirst: false }).order('id'));
      const out = rows.map((r) => {
        const d = daysUntil(r.expires_at);
        const expiry = d === null ? 'none' : d < 0 ? 'expired' : d <= 30 ? 'soon' : 'ok';
        return { title: r.title, document_type: pretty(r.document_type), owner: (r.covered_entities && entityLabel(r.covered_entities)) || r.facilities?.name || '', expires: r.expires_at, days: d, expiry, _e: expiry };
      });
      const label = { expired: 'Expired', soon: 'Expiring within 30 days', ok: 'Current', none: 'No expiry date' };
      return out.filter((r) => !f.expiry || r._e === f.expiry).map(({ _e, ...r }) => ({ ...r, expiry: label[_e] }));
    },
  },
  {
    key: 'savings', title: 'Savings summaries', group: 'Financial',
    description: 'Gross and net 340B savings, acquisition cost and reimbursement by period.',
    filters: [],
    columns: [
      { key: 'entity', label: 'Covered entity', type: 'text' }, { key: 'period_start', label: 'Period start', type: 'date' }, { key: 'period_end', label: 'Period end', type: 'date' },
      { key: 'gross', label: 'Gross savings', type: 'money' }, { key: 'net', label: 'Net savings', type: 'money' },
      { key: 'acquisition', label: 'Acquisition cost', type: 'money' }, { key: 'reimbursement', label: 'Reimbursement', type: 'money' }, { key: 'rx', label: 'Prescriptions', type: 'number' },
    ],
    totals: ['gross', 'net', 'acquisition', 'reimbursement', 'rx'],
    async run(orgId) {
      const rows = await fetchAllRows(() => supabase.from('savings_summaries').select('*, covered_entities(name, entity_type, opais_id)').eq('org_id', orgId).order('period_end', { ascending: false }).order('id'));
      return rows.map((r) => ({ entity: entityLabel(r.covered_entities), period_start: r.period_start, period_end: r.period_end, gross: r.gross_savings, net: r.net_savings, acquisition: r.acquisition_cost, reimbursement: r.reimbursement_total, rx: r.prescriptions_count }));
    },
  },
];

export function reportByKey(key) { return REPORTS.find((r) => r.key === key); }

export function sumTotals(report, rows) {
  const out = {};
  for (const k of report.totals || []) out[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return out;
}

// "Gross savings: $1,200.00; Net savings: $900.00"
export function totalsText(report, rows) {
  const t = sumTotals(report, rows);
  return Object.entries(t).map(([k, v]) => {
    const col = report.columns.find((c) => c.key === k);
    return `${col.label}: ${col.type === 'money' ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString('en-US')}`;
  }).join('; ');
}

export function filtersText(report, filters) {
  const parts = [];
  for (const f of report.filters) {
    const v = filters[f.key];
    if (!v) continue;
    const label = f.type === 'select' ? (f.options.find((o) => o[0] === v)?.[1] ?? v) : v;
    parts.push(`${f.label} = ${label}`);
  }
  return parts.length ? parts.join('; ') : 'None (all records you can see)';
}
