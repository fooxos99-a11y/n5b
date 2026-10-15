import { useState } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { nukhabNavigation } from '../../../../shared/nukhab-theme.js';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { DashboardIcon, type DashboardGlyph } from './DashboardIcon';

export function DashboardButton({ label, icon, onPress, inverse = false, selected = false, iconOnly = false, disabled = false, hint, tone = 'default', iconColor, outlined = false, iconSize, style }: {
  label: string; icon: DashboardGlyph; onPress: () => void; inverse?: boolean; selected?: boolean; iconOnly?: boolean; disabled?: boolean;
  hint?: string;
  tone?: 'default' | 'primary' | 'destructive';
  iconColor?: string; outlined?: boolean;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const [focused, focus] = useState(false); const [hovered, hover] = useState(false);
  const text = inverse || selected ? '#ffffff' : tone === 'primary' ? palette.primary : tone === 'destructive' ? palette.error : palette.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} onFocus={() => focus(true)} onBlur={() => focus(false)}
    onHoverIn={() => hover(true)} onHoverOut={() => hover(false)}
    style={({ pressed }) => [styles.button, iconOnly && styles.compact, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      borderColor: focused ? nukhabNavigation.accent : outlined ? selected ? palette.primary : palette.border : 'transparent',
      backgroundColor: inverse ? selected ? '#ffffff26' : hovered ? '#ffffff14' : 'transparent'
        : selected ? palette.primary : hovered ? palette.selected : 'transparent' }, style,
      focused && { borderColor: nukhabNavigation.accent }]}>
    <DashboardIcon name={icon} color={iconColor ?? (inverse && !selected ? nukhabNavigation.accent : text)} size={iconSize ?? (iconOnly ? 20 : 19)} />
    {!iconOnly && <AppText numberOfLines={1} style={[styles.label, { color: text }]}>{label}</AppText>}
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
  borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  compact: { width: 44, height: 44, minHeight: 44, borderRadius: 12, padding: 0, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
  label: { flex: 1, fontSize: 13, lineHeight: 24, fontFamily: 'CairoBold' } });
