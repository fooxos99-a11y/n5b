import { Pressable, View } from 'react-native';
import { usePalette } from '../../theme';
import { calendarWeekdays, canSelectCalendarDate, type HijriCalendarCell } from '../../domain/hijriDatePicker';
import { AppText } from '../AppText';

export type HijriCalendarGridProps = { cells: readonly HijriCalendarCell[]; value: string; min?: string; max?: string; disabled?: boolean; onChoose: (value: string) => void };

export function HijriCalendarGrid({ cells, value, min, max, disabled = false, onChoose }: HijriCalendarGridProps) {
  const palette = usePalette();
  return <View accessibilityLabel="أيام الشهر" style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
    {calendarWeekdays.map((day, index) => <View key={`weekday-${index}`} style={{ width: '14.285714%', paddingVertical: 4 }}>
      <AppText style={{ textAlign: 'center', fontSize: 12, fontFamily: 'CairoBold', color: palette.muted }}>{day}</AppText>
    </View>)}
    {cells.map((cell, index) => {
      if (!cell) return <View key={`empty-${index}`} style={{ width: '14.285714%', height: 44 }} />;
      const allowed = canSelectCalendarDate(cell.value, min, max, disabled), selected = cell.value === value;
      return <View key={cell.value} style={{ width: '14.285714%', padding: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={cell.label} accessibilityState={{ disabled: !allowed, selected }}
          disabled={!allowed} onPress={() => { if (canSelectCalendarDate(cell.value, min, max, disabled)) onChoose(cell.value); }}
          style={({ pressed }) => ({ minHeight: 44, minWidth: 0, borderRadius: 8, justifyContent: 'center',
            backgroundColor: selected ? palette.primary : pressed ? palette.selected : 'transparent', opacity: !allowed ? 0.3 : 1 })}>
          <AppText style={{ textAlign: 'center', fontSize: 14, fontFamily: 'CairoBold', color: selected ? '#ffffff' : palette.text }}>{cell.day}</AppText>
        </Pressable>
      </View>;
    })}
  </View>;
}
