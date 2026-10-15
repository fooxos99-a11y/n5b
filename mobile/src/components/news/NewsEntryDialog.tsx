import { Image, View } from 'react-native';
import type { NewsCommittee, NewsDraft } from '../../domain/newsManagement';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { screenStyles } from '../ScreenLayout';

export function NewsEntryDialog({ draft, committees, editing, busy, picking, disabled, needsRefresh, error,
  onChange, onPickImage, onSave, onReconcile, onClose }: {
  draft: NewsDraft; committees: readonly NewsCommittee[]; editing: boolean; busy: boolean; picking: boolean; disabled: boolean;
  needsRefresh: boolean; error: string; onChange: (patch: Partial<NewsDraft>) => void; onPickImage: () => void;
  onSave: () => void; onReconcile: () => void; onClose: () => void;
}) {
  const palette = usePalette();
  return <FormDialog visible title={editing ? 'تعديل الخبر' : 'إضافة خبر'} busy={busy || picking} onClose={onClose}
    footer={needsRefresh ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={onReconcile} /> : <>
      <ActionButton label="حفظ الخبر" loading={busy} disabled={disabled} onPress={onSave} />
      <ActionButton label="إلغاء" secondary disabled={busy || picking} onPress={onClose} /></>}>
    <FormField label="الخبر" value={draft.title} editable={!disabled} maxLength={80} onChangeText={title => onChange({ title })} />
    <FormField label="نص الخبر" value={draft.body} multiline editable={!disabled} maxLength={2000} onChangeText={body => onChange({ body })} />
    <FormField label="لون نص الخبر" value={draft.textColor} editable={!disabled} maxLength={7} placeholder="#000000" onChangeText={textColor => onChange({ textColor })} />
    <AppText>الحلقات</AppText>
    {!!draft.legacyStudentIds?.length && <AppText>تخصيص سابق. حفظ التعديل يستبدله بالحلقات المختارة.</AppText>}
    <View style={screenStyles.actions}>
      <ActionButton label="جميع الحلقات" secondary={!!draft.committeeIds.length} disabled={disabled} onPress={() => onChange({ committeeIds: [] })} />
      {committees.map(committee => <ActionButton key={committee.id} label={committee.name} accessibilityLabel={`حلقة ${committee.name}`}
        secondary={!draft.committeeIds.includes(committee.id)} disabled={disabled} onPress={() => onChange({ committeeIds: draft.committeeIds.includes(committee.id)
          ? draft.committeeIds.filter(id => id !== committee.id) : [...draft.committeeIds, committee.id] })} />)}
    </View>
    <View style={screenStyles.grid}>
      <View style={screenStyles.field}><FormField label="بداية العرض" value={draft.startsAt} editable={!disabled} maxLength={10} placeholder="YYYY-MM-DD"
        onChangeText={startsAt => onChange({ startsAt })} /></View>
      <View style={screenStyles.field}><FormField label="نهاية العرض" value={draft.endsAt} editable={!disabled} maxLength={10} placeholder="YYYY-MM-DD"
        onChangeText={endsAt => onChange({ endsAt })} /></View>
    </View>
    {!!draft.image && <Image source={{ uri: draft.image }} accessibilityLabel="صورة الخبر" resizeMode="contain" style={{ width: '100%', height: 160 }} />}
    <View style={screenStyles.actions}>
      <ActionButton label={draft.image ? 'تغيير الصورة' : 'إضافة صورة'} secondary loading={picking} disabled={disabled} onPress={onPickImage} />
      {!!draft.image && <ActionButton label="إزالة الصورة" secondary disabled={disabled} onPress={() => onChange({ image: '' })} />}
      <ActionButton label={`إظهار الخبر: ${draft.enabled ? 'نعم' : 'لا'}`} secondary disabled={disabled} onPress={() => onChange({ enabled: !draft.enabled })} />
    </View>
    {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
  </FormDialog>;
}
