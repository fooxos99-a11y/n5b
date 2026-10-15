import { View } from 'react-native';
import { formatHijriDateTime } from '../../../../shared/hijri-calendar.js';
import { formatPoints } from '../../../../src/lib/pointsFormat.js';
import type { StoreOrder } from '../../domain/storeManagement';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { screenStyles } from '../ScreenLayout';

export function StoreOrderRow({ order, disabled, onDecide }: {
  order: StoreOrder; disabled: boolean; onDecide: (status: 'accepted' | 'rejected') => void;
}) {
  const palette = usePalette();
  return <View style={[screenStyles.row, { borderColor: palette.border }]}>
    <AppText style={screenStyles.bold}>{order.studentName} — {order.productName}</AppText>
    <AppText>{order.committeeName || 'بدون حلقة'} · {formatHijriDateTime(order.createdAt) || '—'}</AppText>
    <AppText>{formatPoints(order.pointsPrice)} · ينتظر المراجعة</AppText>
    <View style={screenStyles.actions}>
      <ActionButton label="قبول" accessibilityLabel={`قبول طلب ${order.studentName} — ${order.productName}`} disabled={disabled} onPress={() => onDecide('accepted')} />
      <ActionButton label="رفض" accessibilityLabel={`رفض طلب ${order.studentName} — ${order.productName}`} secondary disabled={disabled} onPress={() => onDecide('rejected')} />
    </View>
  </View>;
}
