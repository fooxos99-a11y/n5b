import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { getSaudiCalendarDate } from '../../../shared/business-date.js';
import { formatHijriDate, shiftHijriMonth } from '../../../shared/hijri-calendar.js';
import { canSelectCalendarDate, hijriCalendarCells, initialHijriMonth } from '../domain/hijriDatePicker';
import { usePalette } from '../theme';
import { AnchoredPopover } from './AnchoredPopover';
import { AppText } from './AppText';
import { HijriCalendarGrid } from './calendar/HijriCalendarGrid';
import { DashboardButton } from './dashboard/DashboardButton';
import { DashboardIcon } from './dashboard/DashboardIcon';

export function HijriDatePicker({ label, accessibilityLabel = label, value, onChange, min, max, disabled = false }: {
  label: string; accessibilityLabel?: string; value: string; onChange: (value: string) => void; min?: string; max?: string; disabled?: boolean;
}) {
  const palette = usePalette(), { width } = useWindowDimensions();
  const [open, setOpen] = useState(false), [focused, focus] = useState(false);
  const [month, setMonth] = useState(() => initialHijriMonth(value, getSaudiCalendarDate()));
  const selectionLocked = useRef(false), cells = useMemo(() => hijriCalendarCells(month), [month]);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    const next = initialHijriMonth(value, getSaudiCalendarDate());
    setMonth(current => current.getTime() === next.getTime() ? current : next);
  }, [value]);
  const choose = (next: string) => {
    if (!open || selectionLocked.current || !canSelectCalendarDate(next, min, max, disabled)) return;
    selectionLocked.current = true; setOpen(false); onChange(next);
  };
  return <View style={{ minWidth: 0, gap: 6 }}>
    <AppText style={{ fontFamily: 'CairoBold', fontSize: 14, lineHeight: 20 }}>{label}</AppText>
    <AnchoredPopover visible={open && !disabled} onClose={close} label={`تقويم ${accessibilityLabel}`} width={336} align="center" autoFocus={false}
      padding={width >= 640 ? 12 : 8} borderRadius={12}
      trigger={<Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, expanded: open && !disabled }}
        disabled={disabled} onFocus={() => focus(true)} onBlur={() => focus(false)} onPress={() => {
          if (disabled) return; selectionLocked.current = false;
          setMonth(initialHijriMonth(value, getSaudiCalendarDate())); setOpen(current => !current);
        }} style={({ pressed }) => ({ minHeight: 44, minWidth: 0, flex: 1, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12,
          borderColor: focused ? palette.primary : palette.border, backgroundColor: palette.card, opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
          flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxShadow: '0 1px 2px rgba(31,51,71,0.025)' })}>
        <AppText numberOfLines={1} style={{ flex: 1, fontFamily: 'CairoBold', fontSize: 14 }}>{formatHijriDate(value) || 'اختر التاريخ'}</AppText>
        <DashboardIcon name="calendar" color={palette.muted} size={16} />
      </Pressable>}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <DashboardButton iconOnly icon="chevronRight" label="الشهر السابق" disabled={disabled || !open} onPress={() => setMonth(current => shiftHijriMonth(current, -1))} />
          <AppText accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', fontFamily: 'CairoBlack', fontSize: 14 }}>
            {formatHijriDate(month, { day: undefined, month: 'long', year: 'numeric' })}
          </AppText>
          <DashboardButton iconOnly icon="chevronLeft" label="الشهر التالي" disabled={disabled || !open} onPress={() => setMonth(current => shiftHijriMonth(current, 1))} />
        </View>
        <HijriCalendarGrid cells={cells} value={value} min={min} max={max} disabled={disabled || !open} onChoose={choose} />
      </View>
    </AnchoredPopover>
  </View>;
}
