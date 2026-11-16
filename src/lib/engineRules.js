// Plain-language description of every rule the analysis engine runs. Keep in step with
// supabase/migrations/20260115000000_import_and_engines.sql (and ...0001_ndc_digits_compare.sql).

export const RULES = {
  // ---- reconciliation: prescriptions vs dispensing vs purchases vs claims ----
  'RX-DISP-INELIGIBLE': { area: 'Reconciliation', title: 'Dispensed at 340B pricing for an ineligible prescription', how: 'A 340B-priced dispensing record belongs to a prescription whose eligibility is "ineligible".', basis: 'Dispensing 340B drugs to patients who are not eligible is diversion, which HRSA audits for.' },
  'RX-DISP-UNREVIEWED': { area: 'Reconciliation', title: 'Dispensed at 340B pricing before eligibility was reviewed', how: 'A 340B-priced dispensing record belongs to a prescription still "pending review".', basis: 'Eligibility has to be established before 340B stock is used.' },
  'RX-DISP-REVERSED': { area: 'Reconciliation', title: '340B dispensing on a reversed or void prescription', how: 'A 340B-priced dispensing record still exists for a prescription that is reversed or void.', basis: 'The claim should be reversed and the drug returned to stock.' },
  'RX-DISP-NDC': { area: 'Reconciliation', title: 'Dispensed drug differs from prescribed drug', how: 'The NDC dispensed does not match the NDC prescribed (compared by digits, so hyphens do not matter).', basis: 'A mismatch may be a substitution that was not recorded, or a data entry error.' },
  'RX-DISP-QTY': { area: 'Reconciliation', title: 'Dispensed more than prescribed', how: 'The quantity on a dispensing record is higher than the prescription quantity.', basis: 'Over-dispensing is an inventory and billing discrepancy.' },
  'RX-DISPENSED-NO-RECORD': { area: 'Reconciliation', title: 'Marked dispensed with no dispensing record', how: 'A prescription has status "dispensed" but no dispensing record exists for it.', basis: 'Records that cannot be traced to a fill will not survive an audit.' },
  'INV-PURCH-SHORT': { area: 'Reconciliation', title: 'More 340B units dispensed than purchased', how: 'For one drug (NDC) at one covered entity, total 340B units dispensed exceed total units received on purchase orders.', basis: 'HRSA expects dispensing, purchasing and billing records to reconcile. This is a prompt to review: stock on hand before the first recorded purchase will trigger it.' },
  'MCR-TB-MISSING': { area: 'Medicare claims', title: 'Part B claim missing the 340B (TB) modifier', how: 'A Part B claim dated on or after 1 January 2025 links to a prescription dispensed at 340B pricing, and the TB modifier is not marked.', basis: 'CMS requires the TB modifier on separately payable Part B drugs acquired through 340B from 1 January 2025 (the JG modifier was allowed through 2024). Not every drug is separately payable, so confirm before correcting.' },
  'MCR-TB-UNSUPPORTED': { area: 'Medicare claims', title: 'Claim carries the TB modifier without 340B dispensing', how: 'A Part B claim has the TB modifier, but every dispensing record for its prescription is at non-340B pricing.', basis: 'The modifier should only be used for drugs acquired through 340B.' },

  // ---- risk / compliance ----
  'MCD-MEF-UNMATCHED': { area: 'Risk', title: 'Medicaid enrollment unmatched on the Exclusion File', how: 'An active Medicaid enrollment is marked "unmatched" against the HRSA Medicaid Exclusion File.', basis: 'Duplicate discounts (340B plus a Medicaid rebate on the same drug) are a leading audit finding.' },
  'MCD-BILLING-METHOD-MISSING': { area: 'Risk', title: 'Medicaid billing method not recorded', how: 'A covered entity has an active Medicaid enrollment but no carve-in or carve-out choice.', basis: 'The billing choice must match what is listed on the Medicaid Exclusion File.' },
  'CP-INTERNAL-AUDIT-DUE': { area: 'Risk', title: 'Contract pharmacy internal audit overdue', how: 'An active contract pharmacy has no internal audit recorded in the last 92 days.', basis: 'HRSA recommends quarterly internal audits of contract pharmacies.' },
  'CP-INDEPENDENT-AUDIT-DUE': { area: 'Risk', title: 'Contract pharmacy independent audit overdue', how: 'An active contract pharmacy has no independent audit recorded in the last 365 days.', basis: 'HRSA guidelines expect an independent audit at least once a year.' },
  'CP-CONTRACT-EXPIRED': { area: 'Risk', title: 'Contract pharmacy agreement ended but still active', how: 'The contract end date has passed and the contract is still marked active.', basis: 'Dispensing through a pharmacy without a current agreement is a compliance gap.' },
  'CE-RECERT-OVERDUE': { area: 'Risk', title: 'Annual recertification overdue', how: 'The covered entity recertification date has passed.', basis: 'Covered entities must recertify every year to stay in the 340B Program.' },
  'CE-RECERT-DUE-SOON': { area: 'Risk', title: 'Annual recertification due within 30 days', how: 'The recertification date falls in the next 30 days.', basis: 'Covered entities must recertify every year to stay in the 340B Program.' },
  'DOC-EXPIRED': { area: 'Risk', title: 'Compliance document expired', how: 'A document attached to a covered entity is past its expiry date.', basis: 'Expired agreements and certificates should be renewed or replaced.' },

  // ---- opportunities ----
  'OPP-ELIGIBLE-UNFILLED': { area: 'Opportunity', title: 'Eligible prescriptions never filled', how: 'Eligible prescriptions written more than 14 days ago with no dispensing record.', basis: 'Each unfilled eligible prescription is 340B savings not captured.' },
  'OPP-NON340B-PRICED': { area: 'Opportunity', title: 'Eligible prescriptions filled at non-340B pricing', how: 'Dispensing records for eligible prescriptions at WAC, GPO or other pricing.', basis: 'These may have been fillable from 340B stock.' },
  'OPP-REVIEW-BACKLOG': { area: 'Opportunity', title: 'Eligibility review backlog', how: 'Prescriptions waiting more than 30 days for an eligibility decision.', basis: 'Undecided prescriptions cannot be filled at 340B pricing.' },
  'OPP-PHARMACY-IDLE': { area: 'Opportunity', title: 'Contract pharmacy with no recent dispensing', how: 'An active contract pharmacy has no dispensing records in the last 90 days.', basis: 'An idle pharmacy may be a routing problem or a contract that can be retired.' },
};

export function ruleTitle(code) {
  return RULES[code]?.title || code;
}

export const SCOPES = [
  { key: 'all', label: 'Everything', help: 'Reconciliation, risk checks and opportunities' },
  { key: 'reconciliation', label: 'Reconciliation only', help: 'Prescriptions, dispensing, purchases and Medicare claims' },
  { key: 'risk', label: 'Risk checks only', help: 'Medicaid, contract pharmacy audits, recertification, documents' },
  { key: 'opportunities', label: 'Opportunities only', help: 'Unfilled, mis-priced and idle' },
];
