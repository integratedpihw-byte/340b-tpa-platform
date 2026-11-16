// Rates for the HIV performance dashboard. The database returns counts; the rates are worked out here.
//
// A rate is shown only when its denominator is at least MIN_DENOMINATOR. A 100% rate from 2 people says
// very little, and small groups can also point to individuals. Counts are always shown exactly.

export const MIN_DENOMINATOR = 10;

export const GROUPINGS = [
  { key: 'overall', label: 'Overall', first: 'Group' },
  { key: 'site', label: 'By site', first: 'Testing site' },
  { key: 'counselor', label: 'By counselor', first: 'Counselor' },
  { key: 'month', label: 'By month', first: 'Month' },
];

export function rate(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d < MIN_DENOMINATOR) return null;
  return n / d;
}

export function pct(value) {
  return value === null || value === undefined ? null : `${(value * 100).toFixed(1)}%`;
}

// Turns one row from the hiv_performance function into counts plus rates.
export function withRates(row) {
  const num = (k) => Number(row[k] ?? 0);
  const tests = num('tests');
  const positives = num('positives');
  const negatives = num('negatives');
  return {
    key: row.group_key,
    label: row.group_label,
    tests,
    positives,
    negatives,
    indeterminate: num('indeterminate'),
    pending: num('pending'),
    positivity: rate(positives, positives + negatives), // among tests with a final positive or negative result
    riskScreeningRate: rate(num('risk_screened'), tests),
    prepReferralRate: rate(num('negatives_referred_prep'), negatives),
    positivesAssessable: num('positives_assessable'),
    linkage30: rate(num('linked_30d'), num('positives_assessable')),
    art30: rate(num('art_30d'), num('positives_assessable')),
    linked30Count: num('linked_30d'),
    art30Count: num('art_30d'),
    lostToFollowUp: num('lost_to_follow_up'),
    medianDaysToAttend: row.median_days_to_attend === null || row.median_days_to_attend === undefined ? null : Number(row.median_days_to_attend),
  };
}

export function defaultRange(today = new Date()) {
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to };
}

export const EXPORT_COLUMNS = [
  { key: 'label', label: 'Group', type: 'text' },
  { key: 'tests', label: 'Tests', type: 'number' },
  { key: 'positives', label: 'Positive', type: 'number' },
  { key: 'negatives', label: 'Negative', type: 'number' },
  { key: 'indeterminate', label: 'Indeterminate', type: 'number' },
  { key: 'pending', label: 'Pending', type: 'number' },
  { key: 'positivity', label: 'Positivity (%)', type: 'text' },
  { key: 'riskScreeningRate', label: 'Risk screening (%)', type: 'text' },
  { key: 'prepReferralRate', label: 'PrEP referral of negatives (%)', type: 'text' },
  { key: 'positivesAssessable', label: 'Positives 30+ days old', type: 'number' },
  { key: 'linked30Count', label: 'Attended a visit within 30 days', type: 'number' },
  { key: 'linkage30', label: 'Linkage within 30 days (%)', type: 'text' },
  { key: 'art30Count', label: 'ART started within 30 days', type: 'number' },
  { key: 'art30', label: 'ART within 30 days (%)', type: 'text' },
  { key: 'lostToFollowUp', label: 'Lost to follow-up', type: 'number' },
  { key: 'medianDaysToAttend', label: 'Median days to first visit', type: 'number' },
];

// Rows ready for export. A rate that is too small to show is left blank.
export function exportRows(rows) {
  return rows.map((r) => ({
    ...r,
    positivity: r.positivity === null ? '' : (r.positivity * 100).toFixed(1),
    riskScreeningRate: r.riskScreeningRate === null ? '' : (r.riskScreeningRate * 100).toFixed(1),
    prepReferralRate: r.prepReferralRate === null ? '' : (r.prepReferralRate * 100).toFixed(1),
    linkage30: r.linkage30 === null ? '' : (r.linkage30 * 100).toFixed(1),
    art30: r.art30 === null ? '' : (r.art30 * 100).toFixed(1),
  }));
}
