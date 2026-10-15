import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';

export type ManagementTabsProps<Key extends string = string> = { items: readonly { key: Key; label: string }[]; value: string;
  onChoose: (key: Key) => void; label?: string; disabled?: boolean; focusKey?: string | null;
  onKeyboardChoose?: (key: Key) => void; onFocusRestored?: () => void };
export function ManagementTabs<Key extends string>({ items, value, onChoose, label = 'فئات المستخدمين', disabled = false }: ManagementTabsProps<Key>) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  return <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse', minWidth: '100%', paddingHorizontal: width < 640 ? 8 : 16 }}
    style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: palette.border }} accessibilityRole="tablist" accessibilityLabel={label}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: value === item.key, disabled }} disabled={disabled}
      onPress={() => onChoose(item.key)} style={{ opacity: disabled ? 0.5 : 1, minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' }}>
      <AppText style={{ color: value === item.key ? palette.primary : palette.muted, fontFamily: 'CairoBold', fontSize: 14 }}>{item.label}</AppText>
      {value === item.key && <View style={{ position: 'absolute', bottom: 0, right: 12, left: 12, height: 2, borderRadius: 1, backgroundColor: palette.primary }} />}
    </Pressable>)}
  </ScrollView>;
}
