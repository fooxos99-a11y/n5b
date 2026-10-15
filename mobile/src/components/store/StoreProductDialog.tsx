import { View } from 'react-native';
import type { StoreProductDraft } from '../../domain/storeManagement';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { screenStyles } from '../ScreenLayout';
import { StoreProductImage } from './StoreProductImage';

export function StoreProductDialog({ visible, editing, draft, busy, picking, disabled, needsRefresh, error,
  onChange, onPickImage, onSave, onReconcile, onClose }: {
  visible: boolean; editing: boolean; draft: StoreProductDraft; busy: boolean; picking: boolean; disabled: boolean;
  needsRefresh: boolean; error: string; onChange: (patch: Partial<StoreProductDraft>) => void;
  onPickImage: () => void; onSave: () => void; onReconcile: () => void; onClose: () => void;
}) {
  const palette = usePalette();
  return <FormDialog visible={visible} title={editing ? 'تعديل المنتج' : 'إضافة منتج'} busy={busy || picking} onClose={onClose}
    footer={needsRefresh ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={onReconcile} />
      : <><ActionButton label="حفظ المنتج" loading={busy} disabled={disabled} onPress={onSave} />
        <ActionButton label="إلغاء" secondary disabled={busy || picking} onPress={onClose} /></>}>
    <FormField label="اسم المنتج" value={draft.name} editable={!disabled} maxLength={180} onChangeText={name => onChange({ name })} />
    <View style={{ width: 140, alignSelf: 'center' }}><StoreProductImage imageData={draft.imageData} name={draft.name} /></View>
    <ActionButton label={draft.imageData ? 'تغيير الصورة' : 'إضافة صورة (اختياري)'} secondary
      loading={picking} disabled={disabled} onPress={onPickImage} />
    <View style={screenStyles.grid}>
      <View style={screenStyles.field}><FormField label="السعر بالنقاط" value={draft.pointsPrice} keyboardType="number-pad"
        editable={!disabled} maxLength={15} onChangeText={pointsPrice => onChange({ pointsPrice })} /></View>
      <View style={screenStyles.field}><FormField label="المخزون" value={draft.stock} keyboardType="number-pad" placeholder="غير محدود"
        editable={!disabled} maxLength={15} onChangeText={stock => onChange({ stock })} /></View>
    </View>
    <ActionButton label={`إظهار المنتج للطلاب: ${draft.isActive ? 'نعم' : 'لا'}`} secondary disabled={disabled}
      onPress={() => onChange({ isActive: !draft.isActive })} />
    {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
  </FormDialog>;
}
