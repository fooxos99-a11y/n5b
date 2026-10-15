import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { CompensationPolicyDraft } from '../../domain/dayCompensation';
import { useLoadedResource } from '../../hooks/useLoadedResource';
import { useVerifiedMutation } from '../../hooks/useVerifiedMutation';
import type { DayCompensationApi } from '../../services/dayCompensationApi';
import { NativeApiError } from '../../services/nativeApi';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { SectionCard, screenStyles } from '../ScreenLayout';

export function CompensationPolicyDialog({ api, onSaved, onClose }: { api: DayCompensationApi; onSaved: () => Promise<unknown>; onClose: () => void }) {
  const palette = usePalette(); const loader = useCallback((signal: AbortSignal) => api.loadPolicy(signal), [api]);
  const resource = useLoadedResource(loader); const [draft, setDraft] = useState<CompensationPolicyDraft | null>(null);
  const [outdated, setOutdated] = useState(false); const mutation = useVerifiedMutation(resource.reload);
  useEffect(() => { if (resource.value) setDraft({ ...resource.value.policy }); }, [resource.value]);
  const needsRefresh = mutation.uncertain || outdated; const blocked = mutation.busy || needsRefresh || resource.loading || !!resource.error || !api.canEditPolicy();
  function close() { if (needsRefresh) void mutation.reconcile(onClose); else if (!mutation.busy) onClose(); }
  async function save() {
    if (needsRefresh) { await mutation.reconcile(onClose); return; }
    if (!resource.value || !draft) return;
    await mutation.run(async () => {
      try { await api.savePolicy(resource.value!, draft); await onSaved(); }
      catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause; }
    }, onClose, () => 'حُفظت سياسة التعويض والتجاوز.');
  }
  return <FormDialog visible title="التعويض والتجاوز" busy={mutation.busy} onClose={close}
    footer={<View style={screenStyles.actions}><ActionButton label={needsRefresh ? 'تحديث البيانات للتحقق' : 'حفظ سياسة التعويض'} loading={mutation.busy}
      disabled={!needsRefresh && blocked} onPress={() => { void save(); }} /><ActionButton label="إغلاق السياسة" secondary disabled={mutation.busy} onPress={close} /></View>}>
    {resource.loading && <AppText accessibilityLiveRegion="polite">جارٍ تحميل السياسة…</AppText>}
    {!!resource.error && <><AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>
      <ActionButton label="إعادة تحميل السياسة" secondary disabled={mutation.busy} onPress={() => { if (needsRefresh) void mutation.reconcile(onClose); else void resource.reload(); }} /></>}
    {!!draft && <SectionCard><View style={screenStyles.actions}>
      <ActionButton label={`تعويض الحفظ المتأخر: ${draft.allowQuranCompensation ? 'مفعّل' : 'معطّل'}`} secondary={!draft.allowQuranCompensation} disabled={blocked}
        onPress={() => setDraft(current => current ? { ...current, allowQuranCompensation: !current.allowQuranCompensation } : current)} />
      <ActionButton label={`تجاوز مقدار اليوم والتقدم في الخطة: ${draft.allowQuranExtra ? 'مفعّل' : 'معطّل'}`} secondary={!draft.allowQuranExtra} disabled={blocked}
        onPress={() => setDraft(current => current ? { ...current, allowQuranExtra: !current.allowQuranExtra } : current)} />
    </View></SectionCard>}
    {!!mutation.error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{mutation.error}</AppText>}
  </FormDialog>;
}
