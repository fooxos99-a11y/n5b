import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function MessageRecipientFilters({ recipientType, onRecipientTypeChange, roles, committeeId, onCommitteeChange, committees, showCommittees, children }) {
  return <div className={`grid w-full min-w-0 items-center gap-2 [font-family:var(--font-ui)] sm:gap-3 ${children ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]' : 'grid-cols-2'}`}>
    <Select value={recipientType} onValueChange={onRecipientTypeChange}>
      <SelectTrigger aria-label="فئة المستلمين" className="h-11 w-full min-w-0 [&_span]:truncate"><SelectValue /></SelectTrigger>
      <SelectContent>{roles.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
    </Select>
    {showCommittees ? <Select value={committeeId} onValueChange={onCommitteeChange}>
      <SelectTrigger aria-label="الحلقة" className="h-11 w-full min-w-0 [&_span]:truncate"><SelectValue placeholder="جميع الحلقات" /></SelectTrigger>
      <SelectContent><SelectItem value="all">جميع الحلقات</SelectItem>{committees.map((committee) => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>)}</SelectContent>
    </Select> : <div className="min-w-0" />}
    {children}
  </div>;
}
