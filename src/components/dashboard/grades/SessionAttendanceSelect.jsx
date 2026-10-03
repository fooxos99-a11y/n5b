import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ATTENDANCE_LABELS } from './gradesFormat';

export default function SessionAttendanceSelect({ value, onChange, ariaLabel, disabled }) {
  return <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={ariaLabel} className="h-11 w-36 shrink-0 font-bold text-black dark:text-foreground"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
    <SelectContent dir="rtl">{Object.entries(ATTENDANCE_LABELS).map(([status, label]) => <SelectItem key={status} value={status} className="text-black focus:text-black dark:text-foreground dark:focus:text-foreground">{label}</SelectItem>)}</SelectContent>
  </Select>;
}
