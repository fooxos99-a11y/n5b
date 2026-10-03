import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDays, formatDayMonth, weekStartOf, WEEKDAY_LABELS } from './gradesFormat';
import { dateOnly, formatHijriDate, hijriMonthStart, hijriMonthRange, parseDateOnly, shiftHijriMonth } from '../../../../shared/hijri-calendar.js';
import { sessionPeriod } from '../../../../shared/session-period.js';

export default function WeekStartPicker({ value, currentWeekStart, sessionDay = 0, sessionDays = {}, onChange }) {
  const dateForWeek = week => sessionPeriod(week, sessionDays[week] ?? sessionDay).start;
  const [month, setMonth] = useState(() => dateOnly(hijriMonthStart(parseDateOnly(dateForWeek(value)))));
  const move = offset => {
    setMonth(dateOnly(shiftHijriMonth(parseDateOnly(month), offset)));
  };
  const first = weekStartOf(month);
  const weeks = [];
  const end = hijriMonthRange(parseDateOnly(month)).to;
  for (let date = first; date <= end; date = addDays(date, 7)) {
    const sessionDate = dateForWeek(date);
    if (sessionDate >= month && sessionDate <= end) weeks.push(date);
  }
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-1">
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="الشهر السابق" onClick={() => move(-1)}><ChevronRight className="h-4 w-4" /></Button>
      <span className="text-center text-sm font-bold" aria-live="polite">{formatHijriDate(month, {day: undefined, month: 'long'})}</span>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="الشهر التالي" disabled={month >= dateOnly(hijriMonthStart(parseDateOnly(dateForWeek(currentWeekStart))))} onClick={() => move(1)}><ChevronLeft className="h-4 w-4" /></Button>
    </div>
    <div role="group" aria-label="بدايات الأسابيع" className="grid gap-1">
      {weeks.map(date => <Button key={date} type="button" variant={date === value ? 'default' : 'ghost'} aria-pressed={date === value} disabled={date > currentWeekStart} onClick={() => onChange(date)} className="h-11 w-full justify-center text-sm">
        {WEEKDAY_LABELS[new Date(`${dateForWeek(date)}T00:00:00Z`).getUTCDay()]}، {formatDayMonth(dateForWeek(date))}
      </Button>)}
    </div>
    <Button type="button" variant="outline" className="h-11 w-full justify-center" onClick={() => onChange(currentWeekStart)}>هذا الأسبوع</Button>
  </div>;
}
