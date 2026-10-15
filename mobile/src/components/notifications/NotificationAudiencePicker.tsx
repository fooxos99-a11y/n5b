import { useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ChoiceDialog } from '../ChoiceDialog';
import { DashboardIcon } from '../dashboard/DashboardIcon';
import { DashboardButton } from '../dashboard/DashboardButton';
import { DashboardSelect } from '../dashboard/DashboardSelect';
import { ManagementPanel, ManagementToolbar } from '../dashboard/ManagementPanel';
import { emptyNotificationSelection, notificationPersonKey, notificationPersonSelected, notificationRoleLabels,
  selectedNotificationPeople, type NotificationAudience, type NotificationSelection } from '../../domain/notifications';
import type { NativeRole } from '../../domain/nativeSession';
import { usePalette } from '../../theme';

export function NotificationAudiencePicker({ audience, selection, onChange, disabled, children, historyAction }: {
  audience: NotificationAudience; selection: NotificationSelection; onChange: (value: NotificationSelection) => void; disabled: boolean;
  children?: ReactNode; historyAction?: ReactNode;
}) {
  const palette = usePalette(), { width } = useWindowDimensions(); const padding = width < 640 ? 16 : 24;
  const [recipientRole, setRecipientRole] = useState<NativeRole>('student');
  const [circle, setCircle] = useState('all'); const [choices, setChoices] = useState<'role' | 'circle' | null>(null);
  const visible = audience.people.filter(person => person.role === recipientRole
    && (recipientRole !== 'student' || circle === 'all' || String(person.committeeId) === circle));
  const selected = selectedNotificationPeople(audience, selection); const allVisible = visible.length > 0 && visible.every(person => notificationPersonSelected(person, selection));
  function materialize(keys: string[]) { onChange({ ...emptyNotificationSelection(), people: [...new Set(keys)] }); }
  return <ManagementPanel>
    <ManagementToolbar>
      <DashboardSelect grow label="فئة المستلمين" value={notificationRoleLabels[recipientRole]} disabled={disabled} onPress={() => setChoices('role')} />
      {recipientRole === 'student' ? <DashboardSelect grow label="الحلقة" value={audience.committees.find(row => String(row.id) === circle)?.name ?? 'جميع الحلقات'}
        disabled={disabled} onPress={() => setChoices('circle')} /> : <View style={{ flex: 1 }} />}
      {historyAction}
    </ManagementToolbar>
    <View style={{ padding, gap: 8 }}>{children}</View>
    <View style={{ padding, borderTopWidth: 1, borderColor: palette.border, gap: 20 }}>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <ActionButton label={`تحديد الكل (${visible.length})`} accessibilityLabel={allVisible ? 'إلغاء تحديد الظاهر' : 'تحديد الظاهر'} icon={allVisible ? 'checkSquare' : 'square'}
        secondary disabled={disabled || !visible.length} onPress={() => {
        const keys = new Set(visible.map(notificationPersonKey)); materialize(allVisible ? selected.map(notificationPersonKey).filter(key => !keys.has(key))
          : [...selected.map(notificationPersonKey), ...keys]);
      }} />
        <AppText accessibilityLiveRegion="polite" style={{ color: palette.muted, fontFamily: 'CairoSemi', fontSize: 14 }}>المحدد: {selected.length}</AppText>
      </View>
    <ScrollView nestedScrollEnabled style={{ maxHeight: 620 }} contentContainerStyle={{ gap: 12 }}>
    {!visible.length && <AppText style={{ color: palette.muted, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed',
      borderColor: `${palette.primary}33`, borderRadius: 12, paddingVertical: 48 }}>لا يوجد مستلمون لعرضهم.</AppText>}
    {visible.map(person => {
      const key = notificationPersonKey(person), checked = notificationPersonSelected(person, selection);
      return <View key={key} style={{ borderWidth: 1, borderColor: checked ? `${palette.primary}99` : palette.border,
        borderRadius: 16, padding: 16, gap: 12, flexDirection: width >= 768 ? 'row-reverse' : 'column', alignItems: width >= 768 ? 'center' : undefined }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: width >= 768 ? 1 : undefined }}>
          <DashboardButton iconOnly outlined iconSize={16} icon={checked ? 'checkSquare' : 'square'} selected={checked}
            label={`${person.name}، ${checked ? 'محدد' : 'غير محدد'}`} disabled={disabled} onPress={() => materialize(checked
              ? selected.map(notificationPersonKey).filter(value => value !== key) : [...selected.map(notificationPersonKey), key])} />
          <AppText style={{ flex: 1, fontSize: 18, fontFamily: 'CairoBold' }}>{person.name}</AppText>
        </View>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}><DashboardIcon name="notifications" size={20} color={palette.primary} />
          <AppText style={{ color: palette.primary, fontSize: 14, fontFamily: 'CairoBold' }}>{notificationRoleLabels[person.role]}</AppText></View>
      </View>;
    })}</ScrollView></View>
    <ChoiceDialog visible={choices === 'role' && !disabled} title="فئة المستلمين" value={recipientRole}
      options={Object.entries(notificationRoleLabels).map(([value, label]) => ({ value, label }))}
      onChoose={value => { setRecipientRole(value as NativeRole); setCircle('all'); }} onClose={() => setChoices(null)} />
    <ChoiceDialog visible={choices === 'circle' && !disabled} title="الحلقة" value={circle}
      options={[{ value: 'all', label: 'كل الحلقات' }, ...audience.committees.map(row => ({ value: String(row.id), label: row.name }))]}
      onChoose={setCircle} onClose={() => setChoices(null)} />
  </ManagementPanel>;
}
