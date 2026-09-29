import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDays, formatDayMonth, weekStartOf } from './gradesFormat';

const monthLabel = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {month: 'long', year: 'numeric', timeZone: 'UTC'});
export default function WeekStartPicker({ value, currentWeekStart, onChange }) {
  const [month, setMonth] = useState(value.slice(0, 7) + '-01');
  const move = offset => {
    const date = new Date(month + 'T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 10));
  };
  let first = weekStartOf(month);
  if (first < month) first = addDays(first, 7);
  const weeks = [];
  for (let date = first; date.slice(0, 7) === month.slice(0, 7); date = addDays(date, 7)) weeks.push(date);
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-1">
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="الشهر السابق" onClick={() => move(-1)}><ChevronRight className="h-4 w-4" /></Button>
      <span className="text-center text-sm font-bold" aria-live="polite">{monthLabel.format(new Date(month + 'T00:00:00Z'))}</span>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="الشهر التالي" disabled={month.slice(0, 7) >= currentWeekStart.slice(0, 7)} onClick={() => move(1)}><ChevronLeft className="h-4 w-4" /></Button>
    </div>
    <div role="group" aria-label="بدايات الأسابيع" className="grid gap-1">
      {weeks.map(date => <Button key={date} type="button" variant={date === value ? 'default' : 'ghost'} aria-pressed={date === value} disabled={date > currentWeekStart} onClick={() => onChange(date)} className="h-11 w-full justify-center text-sm">
        الأحد، {formatDayMonth(date)}
      </Button>)}
    </div>
    <Button type="button" variant="outline" className="h-11 w-full justify-center" onClick={() => onChange(currentWeekStart)}>هذا الأسبوع</Button>
  </div>;
}
