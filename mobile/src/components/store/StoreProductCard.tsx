import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatPoints } from '../../../../src/lib/pointsFormat.js';
import type { StoreProduct } from '../../domain/storeManagement';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { StoreProductImage } from './StoreProductImage';

export function StoreProductCard({ product, management = false, children }: {
  product: StoreProduct; management?: boolean; children: ReactNode;
}) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
    <StoreProductImage imageData={product.imageData} name={product.name} />
    <AppText style={styles.name}>{product.name}</AppText>
    <AppText>{formatPoints(product.pointsPrice)}</AppText>
    <AppText style={{ color: palette.muted }}>{product.stock === null ? 'مخزون غير محدود' : `المتبقي ${product.stock}`}</AppText>
    {management && <AppText>{product.isActive ? 'ظاهر للطلاب' : 'مخفي عن الطلاب'}</AppText>}
    {children}
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8, flex: 1 },
  name: { fontFamily: 'CairoBold' } });
