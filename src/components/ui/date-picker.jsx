import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getSaudiCalendarDate } from '../../../shared/business-date.js';
import {
  addCalendarDays, dateOnly, formatHijriDate, hijriMonthRange,
  hijriMonthStart, hijriParts, parseDateOnly, shiftHijriMonth,
} from '../../../shared/hijri-calendar';

const weekDays = [
  { value: 6, label: 'س' },
  { value: 0, label: 'ح' },
  { value: 1, label: 'ن' },
  { value: 2, label: 'ث' },
  { value: 3, label: 'ر' },
  { value: 4, label: 'خ' },
  { value: 5, label: 'ج' },
];

const DatePicker = ({
  value,
  id,
  disabled = false,
  onChange,
  min,
  max,
  className,
  ariaLabel = 'التاريخ',
  placeholder = 'اختر التاريخ',
  loadAvailableDates,
  unavailableNote,
}) => {
  const selectedDate = parseDateOnly(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => hijriMonthStart(selectedDate || parseDateOnly(getSaudiCalendarDate())));
  const [datesByMonth, setDatesByMonth] = useState({});
  const [loadingMonth, setLoadingMonth] = useState('');
  const key = dateOnly(visibleMonth);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useEffect(() => {
    const nextSelectedDate = parseDateOnly(value);
    if (nextSelectedDate) setVisibleMonth(hijriMonthStart(nextSelectedDate));
  }, [value]);

  useEffect(() => {
    if (!open || !loadAvailableDates || datesByMonth[key]) return;
    let active = true;
    setLoadingMonth(key);
    loadAvailableDates({
      from: key,
      to: hijriMonthRange(visibleMonth).to,
    }).then((dates) => {
      if (active) {
        setDatesByMonth((current) => ({
          ...current,
          [key]: new Set(dates || []),
        }));
      }
    }).catch(() => {
      if (active) setDatesByMonth((current) => ({ ...current, [key]: new Set() }));
    }).finally(() => {
      if (active) setLoadingMonth('');
    });
    return () => {
      active = false;
    };
  }, [datesByMonth, key, loadAvailableDates, open, visibleMonth]);

  const cells = useMemo(() => {
    const firstDay = visibleMonth.getUTCDay();
    const leading = weekDays.findIndex((day) => day.value === firstDay);
    const daysInMonth = hijriMonthRange(visibleMonth).days;
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => (
        addCalendarDays(visibleMonth, index)
      )),
    ];
  }, [visibleMonth]);

  const availableDates = datesByMonth[key];
  const monthLabel = formatHijriDate(visibleMonth, {
    day: undefined,
    month: 'long',
    year: 'numeric',
  });

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(!disabled && nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          disabled={disabled}
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'h-11 w-full min-w-0 justify-between gap-2 border-border bg-card px-3 font-bold shadow-[0_1px_2px_hsl(210_40%_20%/0.025)] hover:border-primary/35',
            className,
          )}
        >
          <span className="truncate tabular-nums">{formatHijriDate(value) || placeholder}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[min(21rem,calc(100vw-1rem))] p-2 sm:p-3" dir="rtl">
        <div className="mb-3 flex items-center justify-between">
          <Button type="button" size="icon" variant="ghost" className="h-11 w-11" onClick={() => setVisibleMonth((month) => shiftHijriMonth(month, -1))} aria-label="الشهر السابق">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex min-h-10 items-center gap-2 text-sm font-black text-foreground">
            {loadingMonth === key && <LoadingSpinner className="text-primary" />}
            {monthLabel}
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-11 w-11" onClick={() => setVisibleMonth((month) => shiftHijriMonth(month, 1))} aria-label="الشهر التالي">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {weekDays.map((day) => (
            <div key={day.value} className="py-1 text-xs font-bold text-muted-foreground">{day.label}</div>
          ))}
          {cells.map((date, index) => {
            if (!date) return <span key={weekDays[index].value} />;
            const dateValue = dateOnly(date);
            const isSelected = dateValue === value;
            const isUnavailable = loadAvailableDates && !availableDates?.has(dateValue);
            const isOutsideRange = (min && dateValue < min) || (max && dateValue > max);
            const disabled = isUnavailable || isOutsideRange;
            return (
              <button
                key={dateValue}
                type="button"
                disabled={disabled}
                aria-label={formatHijriDate(date, { month: 'long' })}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(dateValue);
                  setOpen(false);
                }}
                className={cn(
                  'flex h-11 min-w-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums transition',
                  disabled
                    ? 'cursor-not-allowed text-muted-foreground/30'
                    : 'text-foreground hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isSelected && 'bg-primary !text-white hover:bg-primary hover:!text-white',
                )}
              >
                {hijriParts(date).day}
              </button>
            );
          })}
        </div>
        {unavailableNote && (
          <p className="mt-3 border-t border-primary/10 pt-2 text-center text-xs font-semibold text-muted-foreground">
            {unavailableNote}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
