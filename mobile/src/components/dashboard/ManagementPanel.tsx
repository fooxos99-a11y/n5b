import { createContext, useContext, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ManagementSection } from '../../domain/dashboardNavigation';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { DashboardButton } from './DashboardButton';
import { ManagementTabs } from './ManagementTabs';
import type { DashboardGlyph } from './DashboardIcon';

export const UserTabsContext = createContext<{ items: readonly { key: ManagementSection; label: string }[]; value: string;
  onChoose: (key: ManagementSection) => void; focusKey: string | null; onKeyboardChoose: (key: ManagementSection) => void; onFocusRestored: () => void } | null>(null);
export function ManagementPanel({ children }: { children: ReactNode }) {
  const palette = usePalette(); const tabs = useContext(UserTabsContext);
  return <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>
    {tabs && <ManagementTabs {...tabs} />}{children}
  </View>;
}
export function ManagementToolbar({ children }: { children: ReactNode }) {
  const palette = usePalette(); const { width } = useWindowDimensions();
  return <View style={[styles.toolbar, { borderColor: palette.border, gap: width < 640 ? 8 : 12, paddingHorizontal: width < 640 ? 16 : 24 }]}>{children}</View>;
}
export function ManagementEmpty({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <AppText style={{ textAlign: 'center', color: palette.muted, paddingHorizontal: 24, paddingVertical: 48 }}>{children}</AppText>;
}
export function ManagementRow({ title, subtitle, image, artwork, onOpen, disabled, actions }: {
  title: string; subtitle?: string; image?: string; artwork?: ReactNode; onOpen?: () => void; disabled?: boolean; actions?: ReactNode;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  return <View style={[styles.row, { borderColor: palette.border, paddingHorizontal: width < 640 ? 16 : 24 }]}>
    {artwork}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={onOpen ? `فتح ${title}` : undefined}
        disabled={disabled || !onOpen} onPress={onOpen} style={styles.title}>
        {!!image && <Image source={{ uri: image }} style={{ width: 16, height: 16, borderRadius: 3 }} />}
        <AppText numberOfLines={1} style={{ fontFamily: 'CairoBold', fontSize: 16, lineHeight: 24, flexShrink: 1 }}>{title}</AppText>
      </Pressable>
      {!!subtitle && <AppText numberOfLines={1} style={{ color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{subtitle}</AppText>}
    </View>
    {actions && <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>{actions}</View>}
  </View>;
}
export function ManagementIconButton({ label, icon, onPress, disabled }: {
  label: string; icon: DashboardGlyph; onPress: () => void; disabled?: boolean;
}) { return <DashboardButton iconOnly iconSize={16} label={label} icon={icon} onPress={onPress} disabled={disabled}
  tone={icon === 'delete' ? 'destructive' : icon === 'edit' ? 'primary' : 'default'} />; }
const styles = StyleSheet.create({ panel: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(16, 36, 62, 0.055)' },
  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1 },
  title: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, minHeight: 24 } });
