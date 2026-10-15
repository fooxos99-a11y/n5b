import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '../AppText';
import { usePalette } from '../../theme';
import { DashboardIcon } from '../dashboard/DashboardIcon';

export function StoreProductImage({ imageData, name, size }: { imageData: string; name: string; size?: number }) {
  const palette = usePalette();
  const [failedSource, setFailedSource] = useState('');
  return <View style={[styles.frame, { backgroundColor: palette.mutedSurface }, size ? { width: size, height: size, padding: 4 } : undefined]}>
    {imageData && failedSource !== imageData
      ? <Image source={{ uri: imageData }} resizeMode="contain" style={styles.image}
        accessibilityLabel={`صورة ${name || 'المنتج'}`} onError={() => setFailedSource(imageData)} />
      : size || !imageData ? <View accessibilityLabel={imageData ? 'تعذّر عرض الصورة' : 'بدون صورة'}><DashboardIcon name="gift" size={24} color={palette.primary} /></View>
        : <AppText style={{ color: palette.muted }}>تعذّر عرض الصورة</AppText>}
  </View>;
}
const styles = StyleSheet.create({ frame: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden',
  alignItems: 'center', justifyContent: 'center', padding: 8 }, image: { width: '100%', height: '100%' } });
