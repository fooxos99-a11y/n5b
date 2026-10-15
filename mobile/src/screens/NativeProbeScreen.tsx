import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { MushafProbe } from './MushafProbe';
import { StorageProbe } from './StorageProbe';
import { CallProbe } from './CallProbe';
import { usePalette } from '../theme';
import logo from '../../../public/branding/nukhab/nukhab-color.png';

export function NativeProbeScreen() {
  const palette = usePalette();
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Image source={logo} resizeMode="contain" style={styles.logo} accessibilityLabel="شعار نخب" />
      <AppText accessibilityRole="header" style={styles.heading}>تجربة نخب</AppText>
      <AppText style={{ color: palette.muted, textAlign: 'center' }}>المصحف والتخزين والمكالمة</AppText>
    </View>
    <MushafProbe /><StorageProbe /><CallProbe />
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { alignItems: 'center', gap: 4, paddingVertical: 18 }, logo: { width: 88, height: 100 },
  heading: { fontFamily: 'CairoBold', fontSize: 27, lineHeight: 42, textAlign: 'center' },
});
