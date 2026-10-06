import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import WeekStartPicker from './WeekStartPicker';
import { addDays, weekStartOf, weeksAgo } from './gradesFormat';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';

export default function RelativeWeekNavigator({ week, today, loading, onChange }) {
  const [open, setOpen] = useState(false);
  const currentWeekStart = week?.currentWeekStart || weekStartOf(today);
  const weekStart = week?.weekStart || currentWeekStart;
  const offset = weeksAgo(weekStart, currentWeekStart);
  const goTo = target => {
    onChange(target === currentWeekStart ? null : target);
    setOpen(false);
  };
  const dateLabel = formatHijriDate(week?.periodStart || weekStart, { month: 'numeric' });
  return <div className="flex w-full max-w-full items-center justify-center gap-1 [font-family:var(--font-ui)] sm:w-fit" dir="rtl">
    <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="الأسبوع السابق" disabled={loading || !week?.hasPreviousWeek} onClick={() => goTo(addDays(weekStart, -7))}>
      <ChevronRight className="h-4 w-4" />
    </Button>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={loading} aria-label="اختيار الأسبوع" title={dateLabel} className="h-11 min-w-0 flex-1 px-2 text-xs sm:min-w-28 sm:flex-none sm:text-sm"><span className="truncate">{dateLabel}</span></Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-64 max-w-[calc(100vw-2rem)] [font-family:var(--font-ui)]">
        <WeekStartPicker key={weekStart + String(open)} value={weekStart} sessionDay={week?.currentSessionDay ?? week?.sessionDay} sessionDays={week?.sessionDays} currentWeekStart={currentWeekStart} onChange={goTo} />
      </PopoverContent>
    </Popover>
    <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="الأسبوع التالي" disabled={loading || offset <= 0} onClick={() => goTo(addDays(weekStart, 7))}>
      <ChevronLeft className="h-4 w-4" />
    </Button>
  </div>;
}
