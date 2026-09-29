import React from 'react';
import { cn } from '@/lib/utils';
import { formatNumber } from './gradesFormat';

/** Grade shown as "grade/max" in a stable left-to-right order. */
export default function GradeScore({ grade, max, className }) {
  if (grade === null || grade === undefined) return <span className={cn('text-muted-foreground', className)}>—</span>;
  return (
    <span dir="ltr" className={cn('inline-block whitespace-nowrap font-black tabular-nums', className)}>
      {formatNumber(grade)}
      {max !== undefined && max !== null && <span className="font-bold text-muted-foreground">/{formatNumber(max)}</span>}
    </span>
  );
}
