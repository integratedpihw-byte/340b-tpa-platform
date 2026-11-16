import React from 'react';
import { ScanSearch } from 'lucide-react';
import { ruleTitle } from './engineRules';

// Shown on records created by the analysis engine, so they are not mistaken for hand-entered ones.
export default function AutoBadge({ row }) {
  if (row.source !== 'engine') return null;
  return (
    <span className="badge badge-neutral" title={`Created by the analysis engine: ${ruleTitle(row.rule_code)} (${row.rule_code})`} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <ScanSearch size={11} /> auto-detected
    </span>
  );
}

export const ENGINE_DELETE_WARNING = 'This record was created by the analysis engine. If you delete it and the condition still exists, the next run will log it again as new. To keep it closed, change its status instead (resolved / false positive / waived / declined).\n\nDelete anyway?';
