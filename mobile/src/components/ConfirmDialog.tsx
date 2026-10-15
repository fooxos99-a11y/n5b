import { ActionButton } from './ActionButton';
import { AppText } from './AppText';
import { FormDialog } from './FormDialog';

export function ConfirmDialog({ visible, title, message, confirmLabel, busy, confirmDisabled, error, onConfirm, onClose }: {
  visible: boolean; title: string; message: string; confirmLabel: string; busy?: boolean; error?: string | null;
  onConfirm: () => void; onClose: () => void; confirmDisabled?: boolean;
}) {
  return <FormDialog visible={visible} title={title} busy={busy} onClose={onClose} maxWidth={448} showClose={false}
    footer={<><ActionButton label={confirmLabel} loading={busy} disabled={confirmDisabled} onPress={onConfirm} /><ActionButton label="إلغاء" secondary disabled={busy} onPress={onClose} /></>}>
    <AppText style={{ fontSize: 14, lineHeight: 28 }}>{message}</AppText>{!!error && <AppText accessibilityRole="alert">{error}</AppText>}
  </FormDialog>;
}
