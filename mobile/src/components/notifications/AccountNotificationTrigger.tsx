import { StyleSheet, View } from 'react-native';
import { palettes, usePalette, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { DashboardButton } from '../dashboard/DashboardButton';

export function AccountNotificationTrigger({ onPress, unreadCount, student = false }: { onPress: () => void; unreadCount?: number; student?: boolean }) {
  const palette = usePalette(), { theme } = useTheme();
  const header = theme === 'dark' ? { background: '#354e5a', border: '#527481', icon: '#a0e3dc' }
    : { background: 'rgba(255,255,255,0.97)', border: '#cce5e8', icon: '#08766d' };
  const count = typeof unreadCount === 'number' && Number.isSafeInteger(unreadCount) && unreadCount > 0 ? unreadCount : 0;
  return <View style={styles.trigger}>
    <DashboardButton iconOnly outlined icon="notifications" label={`إشعارات الحساب${count ? `، ${count} غير مقروء` : ''}`} onPress={onPress}
      iconColor={student ? header.icon : undefined} style={student ? { borderRadius: 13, borderColor: header.border, backgroundColor: header.background } : undefined} />
    {count > 0 && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: student ? theme === 'dark' ? '#ee8b8b' : palettes.light.error : palette.error }]}>
      <AppText style={styles.count}>{Math.min(99, count)}</AppText>
    </View>}
  </View>;
}
const styles = StyleSheet.create({ trigger: { position: 'relative', width: 44, height: 44 },
  badge: { position: 'absolute', top: -4, left: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center' },
  count: { color: '#ffffff', fontSize: 10, lineHeight: 18, fontFamily: 'CairoBlack', writingDirection: 'ltr', textAlign: 'center' } });
