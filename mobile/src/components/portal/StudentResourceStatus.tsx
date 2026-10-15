import { ActivityIndicator, View } from 'react-native';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';

export type StudentResource<T> = { value: T | null; loading: boolean; error: string };
export function StudentResourceStatus<T>({ resource, onRetry, large = false }: {
  resource: StudentResource<T>; onRetry: () => void; large?: boolean;
}) {
  const palette = usePalette();
  return resource.loading ? <View style={{ minHeight: large ? 160 : undefined, flexDirection: 'row-reverse',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 10 }}><ActivityIndicator color={palette.primary} /><AppText>جارٍ التحميل</AppText></View>
    : resource.error ? <View style={{ gap: 8 }}><AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>
      <ActionButton label="إعادة المحاولة" secondary onPress={onRetry} /></View> : null;
}
