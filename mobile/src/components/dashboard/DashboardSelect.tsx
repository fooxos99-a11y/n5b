import { useState } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { DashboardIcon } from './DashboardIcon';

export function DashboardSelect({ label, value, onPress, disabled, basis, grow = false, controlWidth }: { label: string; value: string; onPress: () => void; disabled?: boolean; basis?: number; grow?: boolean; controlWidth?: number }) {
  const palette = usePalette(), { width } = useWindowDimensions(), [focused, focus] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} onFocus={() => focus(true)} onBlur={() => focus(false)} style={({ pressed }) => ({ height: 44, minHeight: 44, minWidth: 0,
      width: controlWidth ?? (width >= 640 && !grow ? 224 : undefined), flex: controlWidth || (width >= 640 && !grow) ? undefined : 1,
      flexBasis: width < 640 ? basis : undefined, paddingHorizontal: width >= 640 ? 16 : 8,
      borderWidth: 1, borderRadius: 12, borderColor: focused ? palette.primary : palette.border, backgroundColor: palette.card,
      opacity: disabled ? 0.6 : pressed ? 0.8 : 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 })}>
    <AppText numberOfLines={1} style={{ flex: 1, fontSize: width >= 640 ? 14 : 12, fontFamily: 'CairoSemi' }}>{value}</AppText>
    <DashboardIcon name="chevronDown" color={palette.muted} size={16} />
  </Pressable>;
}
