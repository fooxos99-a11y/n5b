import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from './AppText';
import { usePalette } from '../theme';

export function ProbeCard({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
    <AppText accessibilityRole="header" style={styles.title}>{title}</AppText>{children}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 20, borderWidth: 1, borderRadius: 24, gap: 14 },
  title: { fontFamily: 'CairoBold', fontSize: 21, lineHeight: 34 } });
