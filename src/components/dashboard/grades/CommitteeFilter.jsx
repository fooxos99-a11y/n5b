import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_COMMITTEES } from './gradesFormat';

/** Circle filter shared by every grades tab. */
export default function CommitteeFilter({ committees, value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="الحلقة" className="h-11 w-full min-w-0 pr-2 pl-7 text-xs sm:w-56 sm:pr-4 sm:pl-10 sm:text-sm [&_span]:truncate [&>svg]:left-2 sm:[&>svg]:left-3">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_COMMITTEES}>جميع الحلقات</SelectItem>
        {committees.map((committee) => (
          <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
