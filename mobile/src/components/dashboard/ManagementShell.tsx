import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import whiteLogo from '../../../../public/branding/nukhab/nukhab-white.png';
import { nukhabNavigation } from '../../../../shared/nukhab-theme.js';
import type { ManagementSection } from '../../domain/dashboardNavigation';
import { usePalette, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { ThemeToggle } from '../ThemeToggle';
import { DashboardButton } from './DashboardButton';
import { DashboardLayoutContext } from './DashboardLayoutContext';
import { UserTabsContext } from './ManagementPanel';
import { userSectionKeys } from '../../../../src/lib/userSections.js';
import { AccountNotificationTrigger } from '../notifications/AccountNotificationTrigger';

const order: readonly ManagementSection[] = ['reports', 'manualAttendance', 'weeklySession', 'trackSession', 'students',
  'supervisors', 'administrators', 'studentPlans', 'families', 'narrationDay', 'quranPassing', 'notifications', 'registrationRequests', 'store', 'news'];
const labels: Partial<Record<ManagementSection, string>> = { reports: 'الإحصائيات', notifications: 'الإشعارات',
  supervisors: 'مشرفي المسارات', administrators: 'الإداريين' };
type Section = { key: ManagementSection; label: string };
type PendingSelection = { key: ManagementSection; from: string; grants: string };
export function ManagementShell({ sections, activeKey, accountTitle, onChoose, onNotifications, onLogout, children, notificationUnreadCount }: {
  sections: readonly Section[]; activeKey: string; accountTitle: string; onChoose: (key: ManagementSection) => void;
  onNotifications: () => void; onLogout: () => void; children: ReactNode;
  notificationUnreadCount?: number;
}) {
  const palette = usePalette(); const { theme } = useTheme(); const { width } = useWindowDimensions();
  const wide = width >= 1024; const [open, setOpen] = useState(false);
  const [drawerPresented, setDrawerPresented] = useState(false);
  const pendingSelection = useRef<PendingSelection | null>(null);
  const grants = sections.map(section => section.key).sort().join('|');
  const [tabFocus, setTabFocus] = useState<string | null>(null);
  const visible = [...sections].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const userTabs = visible.filter(section => userSectionKeys.includes(section.key));
  const activeUser = userTabs.some(section => section.key === activeKey);
  const current = visible.find(section => section.key === activeKey);
  const title = activeUser ? 'المستخدمون' : current ? labels[current.key] ?? current.label : activeKey === 'notificationsInbox' ? 'إشعارات الحساب' : accountTitle;
  useEffect(() => { if (wide) setOpen(false); }, [wide]);
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    if (pending && (wide || pending.from !== activeKey || pending.grants !== grants)) pendingSelection.current = null;
  }, [wide, activeKey, grants]);
  useLayoutEffect(() => () => { pendingSelection.current = null; }, []);
  const closeDrawer = () => { pendingSelection.current = null; setOpen(false); };
  const choose = (key: ManagementSection) => {
    pendingSelection.current = null;
    if (Platform.OS === 'web' && open) {
      // Let the closing drawer release its focus trap before mounting a page
      // whose controls can immediately open a second modal.
      pendingSelection.current = { key, from: activeKey, grants };
      setOpen(false);
      return;
    }
    onChoose(key); setOpen(false);
  };
  const finishDrawerDismiss = () => {
    setDrawerPresented(false);
    const pending = pendingSelection.current; pendingSelection.current = null;
    if (pending && !wide && pending.from === activeKey && pending.grants === grants
      && sections.some(section => section.key === pending.key)) onChoose(pending.key);
  };
  const sidebar = (mobile: boolean) => <View style={styles.sidebarContent}>
    <View style={styles.brand}>
      <Image source={whiteLogo} resizeMode="contain" style={styles.logo} accessibilityLabel="شعار نخب" />
      {mobile && <DashboardButton inverse iconOnly icon="menu" label="إغلاق القائمة الجانبية" onPress={closeDrawer} />}
    </View>
    <ScrollView style={styles.navigation} contentContainerStyle={styles.navigationContent} accessibilityLabel="أقسام المنصة">
      {visible.map(section => userSectionKeys.includes(section.key) ? section.key === userTabs[0]?.key
        ? <DashboardButton key="users" inverse selected={activeUser} label="المستخدمون" icon={section.key}
          onPress={() => choose(activeUser ? activeKey as ManagementSection : section.key)} /> : null
        : <DashboardButton key={section.key} inverse selected={activeKey === section.key}
          label={labels[section.key] ?? section.label} icon={section.key} onPress={() => choose(section.key)} />)}
    </ScrollView>
    <View style={styles.footer}>
      <View style={{ flex: 1 }}><DashboardButton inverse iconColor="#ffffff" label="تسجيل الخروج" icon="logout" onPress={() => { pendingSelection.current = null; onLogout(); }} /></View>
      <ThemeToggle inverse />
    </View>
  </View>;
  return <DashboardLayoutContext.Provider value>
    <View style={[styles.root, { backgroundColor: theme === 'light' ? '#fafbfc' : palette.background }]}>
      {wide && <View style={styles.sidebar}>{sidebar(false)}</View>}
      <View pointerEvents={Platform.OS === 'web' && (open || drawerPresented) ? 'none' : undefined} style={[styles.main, wide && styles.mainWide]}>
        <View style={[styles.header, { height: wide ? 84 : 68, paddingHorizontal: wide ? 32 : 12,
          backgroundColor: palette.card, borderColor: `${palette.border}e6` }]}>
          {!wide && <DashboardButton iconOnly icon="menu" label="فتح القائمة الجانبية" onPress={() => {
            pendingSelection.current = null;
            if (Platform.OS === 'web') setDrawerPresented(true);
            setOpen(true);
          }} />}
          <AppText accessibilityRole="header" numberOfLines={1} style={[styles.title, { fontSize: width >= 640 ? 18 : 16 }]}>{title}</AppText>
          <View style={styles.headerActions}>
            <AccountNotificationTrigger unreadCount={notificationUnreadCount} onPress={() => { pendingSelection.current = null; onNotifications(); }} />
          </View>
        </View>
        <UserTabsContext.Provider value={activeUser ? { items: userTabs.map(section => ({ ...section, label: labels[section.key] ?? section.label })), value: activeKey, onChoose: choose,
          focusKey: tabFocus, onKeyboardChoose: setTabFocus, onFocusRestored: () => setTabFocus(null) } : null}>
          <View style={styles.page}>{children}</View>
        </UserTabsContext.Provider>
      </View>
      <Modal visible={!wide && open} transparent animationType="fade" onRequestClose={closeDrawer}
        onShow={Platform.OS === 'web' ? () => setDrawerPresented(true) : undefined}
        onDismiss={Platform.OS === 'web' ? finishDrawerDismiss : undefined}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق القائمة من الخلفية" onPress={closeDrawer} style={StyleSheet.absoluteFill} />
          <SafeAreaView accessibilityViewIsModal style={[styles.drawer, { width: Math.min(width * 0.88, 320) }]}>{sidebar(true)}</SafeAreaView>
        </View>
      </Modal>
    </View>
  </DashboardLayoutContext.Provider>;
}
const styles = StyleSheet.create({ root: { flex: 1, minWidth: 0 }, sidebar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 276,
  borderLeftWidth: 1, borderColor: '#ffffff0f', boxShadow: '0 0 35px rgba(7,28,43,0.18)' },
  sidebarContent: { flex: 1, backgroundColor: nukhabNavigation.background },
  brand: { height: 88, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#ffffff10',
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 74, height: 68 }, navigation: { flex: 1 }, navigationContent: { paddingHorizontal: 12, paddingVertical: 20, gap: 4 },
  footer: { borderTopWidth: 1, borderColor: '#ffffff10', padding: 12, gap: 8, flexDirection: 'row-reverse', alignItems: 'center' },
  main: { flex: 1, minWidth: 0 }, mainWide: { marginRight: 276 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 18, lineHeight: 30, fontFamily: 'CairoBlack' },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }, page: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: '#071c2b8c' }, drawer: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: nukhabNavigation.background,
    boxShadow: '0 0 48px rgba(7,28,43,0.34)' } });
