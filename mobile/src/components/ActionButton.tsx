import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePalette } from '../theme';
import { AppText } from './AppText';
import { DashboardIcon, type DashboardGlyph } from './dashboard/DashboardIcon';

type Props = { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean; variant?: 'default' | 'login'; icon?: DashboardGlyph; tone?: 'default' | 'success' | 'destructive' | 'danger'; compact?: boolean; selected?: boolean };
export function ActionButton({ label, accessibilityLabel, onPress, disabled = false, loading = false, secondary = false, variant = 'default', icon, tone = 'default', compact = false, selected }: Props) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const { width } = useWindowDimensions(); const login = variant === 'login';
  const inactive = disabled || loading;
  const accent = tone === 'success' ? '#059669' : tone === 'danger' ? '#dc2626' : tone === 'destructive' ? palette.error : palette.primary;
  const foreground = secondary ? tone === 'destructive' ? palette.error : palette.text : tone === 'default' ? palette.onPrimary : '#ffffff';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: inactive, busy: loading, selected }} disabled={inactive} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? palette.card : accent,
      paddingHorizontal: compact ? 12 : 16,
      minHeight: login ? width >= 540 ? 50 : 48 : 44,
      borderColor: focused ? palette.text : secondary ? palette.border : 'transparent', opacity: inactive && !login ? 0.5 : pressed ? 0.75 : 1 }]}>
    {loading ? <ActivityIndicator color={secondary ? accent : foreground} /> : <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {!!icon && <DashboardIcon name={icon} size={16} color={foreground} />}
      <AppText style={{ textAlign: 'center', fontFamily: login ? 'CairoSemi' : 'CairoBold', fontSize: login ? 17 : compact ? 12 : 14, lineHeight: 20, flexShrink: 1,
        color: foreground }}>{label}</AppText></View>}
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 44, paddingHorizontal: 16,
  paddingVertical: 8, borderRadius: 12, borderWidth: 1, justifyContent: 'center' } });
