import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';
import { studentSessionTabs, type StudentSessionTabsProps } from './studentSessionNavigation';
export function StudentSessionTabs({ value, onChange, children }: StudentSessionTabsProps) {
  const { theme } = useTheme(); const dark = theme === 'dark';
  return <View>
    <View accessibilityRole="tablist" accessibilityLabel="أقسام الجلسات" style={{ flexDirection: 'row-reverse', padding: 4,
      borderRadius: 13, gap: 4, marginBottom: 18, backgroundColor: dark ? '#283a49' : '#edf3f5' }}>
      {studentSessionTabs.map(tab => <SessionTab key={tab.value} label={tab.label} selected={value === tab.value} onPress={() => onChange(tab.value)} />)}
    </View>
    <View role="tabpanel" accessibilityLabel={studentSessionTabs.find(tab => tab.value === value)!.label}>{children}</View>
  </View>;
}
function SessionTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme(); const dark = theme === 'dark'; const [focused, focus] = useState(false);
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    onFocus={() => focus(true)} onBlur={() => focus(false)} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center',
      borderRadius: 10, paddingHorizontal: 12, backgroundColor: selected ? dark ? '#405866' : '#ffffff' : 'transparent',
      boxShadow: selected ? '0 2px 7px #173f4b12' : undefined, outlineColor: '#159a8f', outlineWidth: focused ? 2 : 0, outlineOffset: 3 }}>
    <AppText style={{ textAlign: 'center', fontSize: 13, fontFamily: selected ? 'CairoExtraBold' : 'CairoBold',
      color: selected ? dark ? '#a5e7df' : '#097970' : dark ? '#c1d0d9' : '#687e86' }}>{label}</AppText>
  </Pressable>;
}
