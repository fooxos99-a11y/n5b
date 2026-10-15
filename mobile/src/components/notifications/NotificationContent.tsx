import { View } from 'react-native';
import { formatHijriDateTime } from '../../../../shared/hijri-calendar.js';
import { AppText } from '../AppText';
import { screenStyles } from '../ScreenLayout';
import type { AccountNotification, NotificationHistory, NotificationRecipient } from '../../domain/notifications';
import { notificationRoleLabels } from '../../domain/notifications';
import { usePalette } from '../../theme';

export function NotificationContent({ item }: { item: AccountNotification | NotificationHistory }) {
  const palette = usePalette();
  return <View style={{ gap: 8 }}><AppText style={screenStyles.bold}>{item.title}</AppText><AppText>{item.body}</AppText>
    <AppText style={{ color: palette.muted }}>{formatHijriDateTime(item.createdAt)}</AppText>
    {'isRead' in item && <AppText>{item.isRead ? 'قُرئ' : 'غير مقروء'}</AppText>}</View>;
}
export function NotificationRecipientRows({ rows }: { rows: readonly NotificationRecipient[] }) {
  const palette = usePalette();
  return <>{!rows.length && <AppText>لا يوجد مستلمون.</AppText>}{rows.map(person => <View key={`${person.role}:${person.id}`}
    style={[screenStyles.row, { borderColor: palette.border }]}><AppText>{person.name} · {notificationRoleLabels[person.role]}</AppText>
    <AppText>{person.readAt ? 'قُرئ' : 'لم يُقرأ'}</AppText></View>)}</>;
}
