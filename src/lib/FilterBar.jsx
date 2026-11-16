import React from 'react';
import { Filter } from 'lucide-react';
import { describeFilter } from './filters';

// Shown above a list that was opened from a dashboard tile.
export default function FilterBar({ filter, onClear, shown, total }) {
  if (!filter) return null;
  return (
    <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Filter size={14} />
      <span>Showing {shown} of {total}: {describeFilter(filter).join('; ')}</span>
      <button className="btn btn-secondary btn-sm" onClick={onClear}>Show all</button>
    </div>
  );
}
