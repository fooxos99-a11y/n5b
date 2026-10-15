import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { DashboardIcon } from './dashboard/DashboardIcon';
import { usePalette } from '../theme';
import type { ChoiceOption } from './ChoiceDialog';

export type ChoiceOptionsProps = { title: string; options: readonly ChoiceOption[]; value?: string; onChoose: (value: string) => void };
export function ChoiceOptions({ title, options, value, onChoose }: ChoiceOptionsProps) {
  const palette = usePalette();
  return <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: 4 }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
      accessibilityState={{ checked: value === option.value }} onPress={() => onChoose(option.value)}
      style={({ pressed }) => ({ minHeight: 44, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
        flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
        backgroundColor: pressed || value === option.value ? palette.selected : 'transparent' })}>
      <AppText style={{ flex: 1, fontSize: 14, lineHeight: 24 }}>{option.label}</AppText>
      {value === option.value && <DashboardIcon name="check" size={16} color={palette.primary} />}
    </Pressable>)}
    {!options.length && <AppText>لا توجد خيارات متاحة.</AppText>}
  </View>;
}
