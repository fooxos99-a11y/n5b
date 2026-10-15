import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePalette, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { ThemeToggle } from '../ThemeToggle';
import { DashboardButton } from '../dashboard/DashboardButton';
import { PortalNavigationButton } from './PortalNavigationButton';
import { AccountNotificationTrigger } from '../notifications/AccountNotificationTrigger';

export function StudentPortalSurface({ children, name, level, progress, accountMenu, onNotifications, onStore, onHome, homeActive, notificationUnreadCount }: {
  children: ReactNode; name: string; level?: string; progress?: number; accountMenu: ReactNode;
  onNotifications?: () => void; onStore?: () => void; onHome: () => void; homeActive: boolean; notificationUnreadCount?: number;
}) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const compact = width < 900;
  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ backgroundColor: palette.card, borderBottomWidth: 1, borderColor: palette.border }}>
      <View style={[styles.header, { paddingHorizontal: width <= 420 ? 12 : 20, gap: width <= 420 ? 8 : 16 }]}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: width <= 420 ? 9 : 13 }}>
          <View style={styles.avatar}>
            <Svg width={44} height={44} style={StyleSheet.absoluteFill} accessible={false}>
              <Defs><LinearGradient id="student-avatar" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#088076" /><Stop offset="1" stopColor="#096f66" /></LinearGradient></Defs>
              <Rect width="44" height="44" rx="22" fill="url(#student-avatar)" />
            </Svg>
            {accountMenu}
          </View>
          <View style={{ flexShrink: 1, minWidth: 0, gap: 6, direction: 'ltr' }}>
            <AppText style={styles.name}>{name}{level ? ` (${level})` : ''}</AppText>
            {!!level && <View style={{ width: 130, alignSelf: 'flex-end' }}><StudentProgress value={progress ?? 0} label={`تقدم ${level}`} height={10} /></View>}
          </View>
        </View>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: width <= 420 ? 6 : 10 }}>
          <View style={{ backgroundColor: palette.selected, borderRadius: 13 }}><ThemeToggle /></View>
          {!compact && onStore && <View style={{ backgroundColor: '#088076', borderRadius: 13 }}><DashboardButton iconOnly icon="store" label="المتجر" iconColor="#ffffff" onPress={onStore} /></View>}
          {onNotifications && <View style={{ backgroundColor: palette.selected, borderRadius: 13 }}><AccountNotificationTrigger student unreadCount={notificationUnreadCount} onPress={onNotifications} /></View>}
        </View>
      </View>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.main, { paddingVertical: width >= 640 ? 32 : 24,
      paddingHorizontal: width >= 640 ? 28 : 16, gap: width >= 640 ? 22 : 18, paddingBottom: compact ? 24 : 32 }]}>{children}</ScrollView>
    {compact && <StudentBottomNavigation homeActive={homeActive} onHome={onHome} onStore={onStore} />}
  </View>;
}
export function StudentBottomNavigation({ homeActive, onHome, onStore }: { homeActive: boolean; onHome: () => void; onStore?: () => void }) {
  const palette = usePalette();
  return <View role="navigation" accessibilityLabel="تنقل الطالب" style={{ flexDirection: 'row-reverse', backgroundColor: palette.card, borderTopWidth: 1,
    borderColor: palette.border, width: '100%', minHeight: 76, paddingVertical: 7, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-around', gap: 12 }}>
    <PortalNavigationButton icon="home" label="الرئيسية" selected={homeActive} onPress={onHome} />
    {onStore && <PortalNavigationButton icon="store" label="المتجر" onPress={onStore} />}
  </View>;
}

export function StudentProgress({ value, label, height = 7 }: { value: number; label: string; height?: number }) {
  const { theme } = useTheme(); const percent = Math.max(0, Math.min(100, value));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: percent }}
    style={{ height, borderRadius: 99, overflow: 'hidden', backgroundColor: theme === 'dark' ? '#465d6d' : '#e8eef1' }}>
    <View style={{ width: `${percent}%`, height: '100%', alignSelf: 'flex-end' }}>
      <Svg width="100%" height={height} accessible={false}>
        <Defs><LinearGradient id="student-progress" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={theme === 'dark' ? '#4fa99f' : '#086860'} /><Stop offset="1" stopColor={theme === 'dark' ? '#93d7ce' : '#12a6a7'} />
        </LinearGradient></Defs><Rect width="100%" height={height} rx={height / 2} fill="url(#student-progress)" />
      </Svg>
    </View>
  </View>;
}
export function StudentPortalCard({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette(); const { width } = useWindowDimensions();
  return <View style={{ padding: width >= 640 ? 27 : 20, borderWidth: 1, borderColor: palette.border, borderRadius: 22,
    backgroundColor: palette.card, boxShadow: '0 6px 22px #21435604', minWidth: 0, gap: 18 }}>
    {!!title && <AppText accessibilityRole="header" style={{ fontFamily: 'CairoExtraBold', fontSize: width >= 640 ? 22 : 19, lineHeight: 32 }}>{title}</AppText>}
    {children}
  </View>;
}
const styles = StyleSheet.create({ header: { width: '100%', maxWidth: 1040, alignSelf: 'center', minHeight: 78,
  paddingVertical: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, boxShadow: '0 4px 12px #09626f20', outlineStyle: 'solid', outlineColor: '#c9e5e8', outlineWidth: 1, outlineOffset: 3 },
  name: { fontFamily: 'CairoExtraBold', fontSize: 13, lineHeight: 16 },
  main: { width: '100%', maxWidth: 960, alignSelf: 'center', flexGrow: 1 } });
