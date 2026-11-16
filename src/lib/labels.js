// Display label for a covered entity. Entities created before a name existed fall back to
// their OPAIS ID and type, so a dropdown or table cell is never blank.
export function entityLabel(e) {
  if (!e) return '—';
  if (e.name) return e.name;
  const type = (e.entity_type || '').replace(/_/g, ' ');
  if (e.opais_id) return type ? `${e.opais_id} (${type})` : e.opais_id;
  return type || 'Unnamed entity';
}
