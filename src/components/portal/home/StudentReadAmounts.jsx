import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentReadAmounts({ groups, onRead }) {
  if (!groups.length) return null;
  // The day's amounts sit side by side, one column each.
  return <div className="student-home-task-grid" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>{groups.map((group) => (
    <Button key={group.type} variant="outline" className="student-home-task" disabled={!group.target} onClick={() => onRead(group.target)}>
      <span>{group.label}{group.complete && <Check size={15} aria-label="مكتمل" />}</span>
      {!group.complete && <small>{group.amount}</small>}
    </Button>
  ))}</div>;
}
