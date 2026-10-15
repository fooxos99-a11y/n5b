import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActionButton } from './ActionButton';
import { AppText } from './AppText';
import { usePalette, useTheme } from '../theme';
import { useDashboardLayout } from './dashboard/DashboardLayoutContext';
import { ThemeToggle } from './ThemeToggle';

export function ScreenLayout({ title, children, onBack, actions, loading, error, onRetry, contentGap = 16 }: {
  title: string; children: ReactNode; onBack?: () => void; actions?: ReactNode;
  loading?: boolean; error?: string | null; onRetry?: () => void;
  contentGap?: number;
}) {
  const palette = usePalette();
  const managed = useDashboardLayout(); const { width } = useWindowDimensions(); const { theme } = useTheme();
  return <KeyboardAvoidingView style={{ flex: 1, minWidth: 0, backgroundColor: managed && theme === 'light' ? '#fafbfc' : palette.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: contentGap }, managed && {
      maxWidth: 1480, paddingHorizontal: width >= 1024 ? 32 : width >= 640 ? 20 : 12, paddingTop: width >= 1024 ? 30 : width >= 640 ? 24 : 16 }]}>
      {!managed && <View style={styles.header}><AppText accessibilityRole="header" style={styles.title}>{title}</AppText>
        <View style={screenStyles.actions}><ThemeToggle />{onBack && <ActionButton label="رجوع" secondary onPress={onBack} />}</View></View>}
      {actions}
      {loading && <View style={styles.status}><ActivityIndicator color={palette.primary} /><AppText>جارٍ التحميل</AppText></View>}
      {!!error && <View style={styles.status}><AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>
        {onRetry && <ActionButton label="إعادة المحاولة" secondary onPress={onRetry} />}</View>}
      {children}
    </ScrollView>
  </KeyboardAvoidingView>;
}
export function SectionCard({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
    {title && <AppText accessibilityRole="header" style={styles.subtitle}>{title}</AppText>}{children}
  </View>;
}
export const screenStyles = StyleSheet.create({ actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 }, field: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0, maxWidth: '100%' },
  row: { gap: 8, paddingVertical: 14, borderBottomWidth: 1 }, bold: { fontFamily: 'CairoBold' } });
const styles = StyleSheet.create({ content: { flexGrow: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 16, paddingBottom: 40, gap: 16 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  title: { fontFamily: 'CairoBold', fontSize: 24, lineHeight: 38 }, subtitle: { fontFamily: 'CairoBold', fontSize: 18, lineHeight: 30 },
  card: { padding: 18, borderWidth: 1, borderRadius: 18, gap: 14 }, status: { alignItems: 'center', gap: 12, padding: 16 } });
