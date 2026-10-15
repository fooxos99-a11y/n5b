import { useState } from 'react';
import { Pressable } from 'react-native';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { DashboardIcon, type DashboardGlyph } from '../dashboard/DashboardIcon';

export function PortalNavigationButton({ label, icon, onPress, selected = false, disabled = false }: {
  label: string; icon: DashboardGlyph; onPress: () => void; selected?: boolean; disabled?: boolean;
}) {
  const palette = usePalette(); const [focused, focus] = useState(false); const [hovered, hover] = useState(false);
  const color = selected ? palette.primary : palette.muted;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} onFocus={() => focus(true)} onBlur={() => focus(false)}
    onHoverIn={() => hover(true)} onHoverOut={() => hover(false)}
    style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 54, padding: 6, gap: 4, alignItems: 'center', justifyContent: 'center',
      borderRadius: 12, borderWidth: 2, borderColor: focused ? palette.primary : 'transparent',
      backgroundColor: selected || hovered ? palette.selected : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.75 : 1 })}>
    <DashboardIcon name={icon} color={color} size={21} />
    <AppText style={{ color, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>{label}</AppText>
  </Pressable>;
}
