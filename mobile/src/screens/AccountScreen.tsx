import { ScrollView, StyleSheet, View } from 'react-native';
import { normalizeDashboardGrants } from '../../../shared/dashboard-permissions.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import type { NativeSession } from '../domain/nativeSession';
import type { ManagementSection } from '../domain/dashboardNavigation';
import { usePalette } from '../theme';
import { useDashboardLayout } from '../components/dashboard/DashboardLayoutContext';
import { ThemeToggle } from '../components/ThemeToggle';

const titles = { manager: 'حساب المدير', student: 'حساب الطالب', supervisor: 'حساب المشرف', admin: 'حساب الإداري' };
const labels: Record<string, string> = {
  manualAttendance: 'التحضير', staffAttendance: 'تحضير الموظفين', registrationRequests: 'طلبات التسجيل',
  students: 'الطلاب', studentPlans: 'خطط الطلاب', narrationDay: 'يوم السرد', quranPassing: 'الاجتياز',
  calls: 'المكالمات', quranEvaluation: 'جلسات التسميع', weeklySession: 'الجلسة الأسبوعية', trackSession: 'جلسة المسار',
  families: 'المجمعات والحلقات', supervisors: 'مشرفو المسارات', administrators: 'الإداريون', notifications: 'الإشعارات',
  reports: 'الإحصائيات', whatsappSend: 'الإرسال عبر الواتس', settings: 'الإعدادات', store: 'المتجر',
};

export function AccountScreen({ session, onLogout, refreshing = false, onRefresh, error, sections = [], onSection, onWorkspace, onNotifications }: {
  session: NativeSession; onLogout: () => void; onRefresh: () => void; refreshing?: boolean; error?: string | null;
  sections?: readonly { key: ManagementSection; label: string }[]; onSection?: (key: ManagementSection) => void; onWorkspace?: () => void;
  onNotifications?: () => void;
}) {
  const palette = usePalette();
  const managed = useDashboardLayout();
  const grants = normalizeDashboardGrants([...session.dashboardPermissions]);
  return <ScrollView contentContainerStyle={styles.content}>
    {!managed && <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText accessibilityRole="header" style={styles.heading}>{titles[session.role]}</AppText><ThemeToggle /></View>}
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <AppText style={styles.name}>{session.name}</AppText>
      {!!session.complex.name && <AppText>{session.complex.name}</AppText>}
    </View>
    {onWorkspace && <ActionButton label={session.role === 'student' ? 'مساحة الطالب' : 'مساحة المشرف'} onPress={onWorkspace} />}
    {onNotifications && <ActionButton label="إشعارات الحساب" secondary onPress={onNotifications} />}
    {sections.map(section => <ActionButton key={section.key} label={section.label} disabled={refreshing}
      onPress={() => onSection?.(section.key)} />)}
    {session.role !== 'student' && session.role !== 'manager' && <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <AppText accessibilityRole="header" style={styles.subheading}>صلاحيات الحساب</AppText>
      {grants.length ? grants.map((key: string) => <AppText key={key}>{labels[key] || key}</AppText>) :
        <AppText>لم تمنحك الإدارة صلاحيات بعد.</AppText>}
    </View>}
    {!!sections.length && <AppText style={{ color: palette.muted }}>الأقسام المتاحة في النسخة الحالية</AppText>}
    {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    <ActionButton label="تحديث الجلسة" secondary onPress={onRefresh} loading={refreshing} />
    {!managed && <ActionButton label="تسجيل الخروج" onPress={onLogout} disabled={refreshing} />}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 18, width: '100%', maxWidth: 580, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 },
  heading: { fontFamily: 'CairoBold', fontSize: 26, lineHeight: 42 },
  subheading: { fontFamily: 'CairoBold', fontSize: 18, lineHeight: 30 }, name: { fontFamily: 'CairoBold', fontSize: 20, lineHeight: 34 },
});
