import { useEffect, useRef, useState } from 'react';
import { calendarFocusIndex, calendarWeekdays, canSelectCalendarDate } from '../../domain/hijriDatePicker';
import { usePalette } from '../../theme';
import type { HijriCalendarGridProps } from './HijriCalendarGrid';

export function HijriCalendarGrid({ cells, value, min, max, disabled = false, onChoose }: HijriCalendarGridProps) {
  const palette = usePalette(), refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = cells.findIndex(cell => cell?.value === value && canSelectCalendarDate(cell.value, min, max, disabled));
  const initial = selected >= 0 ? selected : cells.findIndex(cell => cell && canSelectCalendarDate(cell.value, min, max, disabled));
  const [focused, setFocused] = useState(initial);
  useEffect(() => { if (!disabled) refs.current[initial]?.focus(); }, [cells, initial, disabled]);
  return <div aria-label="أيام الشهر" dir="rtl" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 2 }}>
    {calendarWeekdays.map((day, index) => <div key={`weekday-${index}`} aria-hidden="true" style={{ textAlign: 'center', paddingBlock: 4,
      fontFamily: 'CairoBold', fontSize: 12, lineHeight: '26px', color: palette.muted }}>{day}</div>)}
    {cells.map((cell, index) => cell ? <button key={cell.value} type="button" aria-label={cell.label} aria-pressed={cell.value === value}
      disabled={!canSelectCalendarDate(cell.value, min, max, disabled)} tabIndex={index === focused || !cells[focused] ? 0 : -1}
      ref={element => { refs.current[index] = element; }} onFocus={() => setFocused(index)}
      onClick={() => { if (canSelectCalendarDate(cell.value, min, max, disabled)) onChoose(cell.value); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); refs.current[calendarFocusIndex(cells, index, event.key, min, max)]?.focus();
      }} style={{ minHeight: 44, minWidth: 0, border: 'none', borderRadius: 8, padding: 0, fontFamily: 'CairoBold', fontSize: 14,
        lineHeight: '26px', cursor: canSelectCalendarDate(cell.value, min, max, disabled) ? 'pointer' : 'not-allowed',
        outlineColor: palette.primary, outlineOffset: -2, background: cell.value === value ? palette.primary : 'transparent',
        color: cell.value === value ? '#ffffff' : palette.text, opacity: canSelectCalendarDate(cell.value, min, max, disabled) ? 1 : 0.3 }}>{cell.day}</button>
      : <span key={`empty-${index}`} aria-hidden="true" />)}
  </div>;
}
