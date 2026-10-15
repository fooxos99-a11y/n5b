import { formatPoints } from '../../../../src/lib/pointsFormat.js';
import type { StoreProduct } from '../../domain/storeManagement';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';

export function StorePurchaseDialog({ product, busy, disabled, error, onConfirm, onClose }: {
  product: StoreProduct | null; busy: boolean; disabled: boolean; error: string; onConfirm: () => void; onClose: () => void;
}) {
  const palette = usePalette();
  return <FormDialog visible={!!product} title="تأكيد الشراء" busy={busy} onClose={onClose}
    footer={<><ActionButton label="تأكيد الشراء" loading={busy} disabled={disabled} onPress={onConfirm} />
      <ActionButton label="إلغاء" secondary disabled={busy} onPress={onClose} /></>}>
    {product && <><AppText>{product.name}</AppText><AppText>{formatPoints(product.pointsPrice)}</AppText>
      <AppText>تُحجز النقاط حتى مراجعة الطلب، وتُعاد عند رفضه.</AppText></>}
    {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
  </FormDialog>;
}
