// Filters carried from a dashboard tile to a list page: { field: value } or { field: [v1, v2] }.
export function applyFilter(rows, filter) {
  if (!filter) return rows;
  return rows.filter((r) => Object.entries(filter).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
}

export function describeFilter(filter) {
  return Object.entries(filter || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} = ${(Array.isArray(v) ? v : [v]).map((x) => String(x).replace(/_/g, ' ')).join(' or ')}`);
}
