import type { StoreConfiguration } from '../../domain/storeManagement';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';

export function StoreSettingsDialog({ visible, configuration, busy, disabled, needsRefresh, error, onChange, onReconcile, onClose }: {
  visible: boolean; configuration: StoreConfiguration; busy: boolean; disabled: boolean; needsRefresh: boolean; error: string;
  onChange: (patch: Partial<Pick<StoreConfiguration, 'storeEnabled' | 'storePurchaseDeductsRanking'>>) => void;
  onReconcile: () => void; onClose: () => void;
}) {
  const palette = usePalette();
  return <FormDialog visible={visible} title="إعدادات المتجر" busy={busy} onClose={onClose}
    footer={needsRefresh ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={onReconcile} /> : undefined}>
    <ActionButton label={`المتجر: ${configuration.storeEnabled ? 'مفعّل' : 'متوقف'}`} secondary disabled={disabled}
      onPress={() => onChange({ storeEnabled: !configuration.storeEnabled })} />
    <ActionButton label={`خصم النقاط من الترتيب عند الشراء من المتجر: ${configuration.storePurchaseDeductsRanking ? 'نعم' : 'لا'}`}
      secondary disabled={disabled || !configuration.storeEnabled}
      onPress={() => onChange({ storePurchaseDeductsRanking: !configuration.storePurchaseDeductsRanking })} />
    {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
  </FormDialog>;
}
