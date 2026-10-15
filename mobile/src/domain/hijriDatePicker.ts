import { addCalendarDays, dateOnly, formatHijriDate, hijriMonthRange, hijriMonthStart, parseDateOnly } from '../../../shared/hijri-calendar.js';

export const calendarWeekdays = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'] as const;
export type HijriCalendarCell = { value: string; day: number; label: string } | null;

export function initialHijriMonth(value: string, fallback: string): Date {
  const date = parseDateOnly(value) ?? parseDateOnly(fallback);
  if (!date) throw new Error('A valid calendar reference date is required');
  return hijriMonthStart(date);
}

export function hijriCalendarCells(month: Date): readonly HijriCalendarCell[] {
  const start = hijriMonthStart(month), leading = (start.getUTCDay() + 1) % 7;
  return [...Array.from({ length: leading }, () => null), ...Array.from({ length: hijriMonthRange(start).days }, (_, index) => {
    const date = addCalendarDays(start, index);
    return { value: dateOnly(date), day: index + 1, label: formatHijriDate(date, { month: 'long' }) };
  })];
}

export function canSelectCalendarDate(value: string, min?: string, max?: string, disabled = false): boolean {
  if (disabled || !parseDateOnly(value) || (min !== undefined && !parseDateOnly(min)) || (max !== undefined && !parseDateOnly(max))) return false;
  return !(min && value < min) && !(max && value > max) && !(min && max && min > max);
}

export function calendarFocusIndex(cells: readonly HijriCalendarCell[], current: number, key: string, min?: string, max?: string): number {
  const enabled = (index: number) => !!cells[index] && canSelectCalendarDate(cells[index]!.value, min, max);
  let step = key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : key === 'ArrowDown' ? 7 : key === 'ArrowUp' ? -7 : 0;
  let candidate = current + step;
  if (key === 'Home' || key === 'End') {
    const start = Math.floor(current / 7) * 7;
    step = key === 'Home' ? 1 : -1; candidate = key === 'Home' ? start : Math.min(start + 6, cells.length - 1);
    const end = key === 'Home' ? Math.min(start + 6, cells.length - 1) : start;
    for (; step > 0 ? candidate <= end : candidate >= end; candidate += step) if (enabled(candidate)) return candidate;
    return current;
  }
  if (!step) return current;
  for (; candidate >= 0 && candidate < cells.length; candidate += step) if (enabled(candidate)) return candidate;
  return current;
}
