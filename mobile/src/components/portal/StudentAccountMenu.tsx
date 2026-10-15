import { useState } from 'react';
import { View } from 'react-native';
import { PaletteContext, palettes, usePalette, useTheme } from '../../theme';
import { AnchoredPopover } from '../AnchoredPopover';
import { DashboardButton } from '../dashboard/DashboardButton';
import { StudentPointsValue } from './StudentPointsValue';

export function StudentAccountMenu({ points, onSessions, onLogout, logoutLoading = false }: {
  points: number | null; onSessions: () => void; onLogout: () => void; logoutLoading?: boolean;
}) {
  const palette = usePalette(); const { theme } = useTheme(); const [open, setOpen] = useState(false);
  const menuPalette = theme === 'dark' ? { ...palette, text: '#e9f2f1', error: '#ee8b8b', selected: '#3d6663' }
    : { ...palette, error: '#bd4d47', selected: palettes.light.selected };
  return <PaletteContext.Provider value={menuPalette}>
    <AnchoredPopover visible={open} onClose={() => setOpen(false)} label="الحساب" width={180} edgeGap={0} busy={logoutLoading}
      trigger={<DashboardButton iconOnly icon="account" iconSize={24} iconColor="#ffffff" label="قائمة حساب الطالب" onPress={() => setOpen(value => !value)} />}>
      <View accessibilityLabel="إجمالي النقاط" style={{ padding: 10, borderBottomWidth: 1,
        borderColor: theme === 'dark' ? '#4a5e6d' : '#e7eef1', marginBottom: 4 }}><StudentPointsValue value={points} /></View>
      <DashboardButton icon="weeklySession" iconSize={18} label="الجلسات" style={itemStyle} disabled={logoutLoading} onPress={() => { setOpen(false); onSessions(); }} />
      <DashboardButton icon="logout" iconSize={18} label="تسجيل الخروج" style={itemStyle} tone="destructive" disabled={logoutLoading} onPress={() => { setOpen(false); onLogout(); }} />
    </AnchoredPopover>
  </PaletteContext.Provider>;
}
const itemStyle = { minHeight: 44, gap: 9, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 };
