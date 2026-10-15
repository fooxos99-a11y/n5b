import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { formatHijriDate, formatHijriDateTime } from '../../../../shared/hijri-calendar.js';
import { activeDayCompensation, compensationScopeLabel, type DayCompensationScope } from '../../domain/dayCompensation';
import { useLoadedResource } from '../../hooks/useLoadedResource';
import { useVerifiedMutation } from '../../hooks/useVerifiedMutation';
import type { DayCompensationApi } from '../../services/dayCompensationApi';
import { NativeApiError } from '../../services/nativeApi';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';

export function DayCompensationDialog({ api, scope, student, date, onSaved, onClose }: {
  api: DayCompensationApi; scope: DayCompensationScope; student: { id: number; name: string }; date: string;
  onSaved: () => Promise<unknown>; onClose: () => void;
}) {
  const palette = usePalette(); const [chosenDate, setChosenDate] = useState(date); const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<'grant' | 'cancel' | null>(null); const [outdated, setOutdated] = useState(false); const [limit, setLimit] = useState(30);
  const loader = useCallback((signal: AbortSignal) => api.load(scope, student.id, chosenDate, signal), [api, scope, student.id, chosenDate]);
  const resource = useLoadedResource(loader); const source = resource.value;
  const reload = async () => { const verified = await resource.reload(); if (verified) await onSaved(); return verified; };
  const mutation = useVerifiedMutation(reload); const needsRefresh = mutation.uncertain || outdated;
  const blocked = mutation.busy || needsRefresh || resource.loading || !!resource.error;
  const active = source ? activeDayCompensation(source) : undefined;
  const pending = source?.student.days.find(day => day.date === chosenDate);
  const canManage = !!source?.canManage && api.canEditPolicy();
  function close() {
    if (needsRefresh) { void mutation.reconcile(() => { setOutdated(false); onClose(); }); return; }
    if (!mutation.busy) onClose();
  }
  async function save() {
    if (needsRefresh) { await mutation.reconcile(() => { setOutdated(false); onClose(); }); return; }
    if (!source || !confirm) return;
    await mutation.run(async () => {
      try {
        if (confirm === 'cancel' && active) await api.cancel(source, active, reason);
        else if (confirm === 'grant' && pending) await api.compensate(source, pending);
        else throw new NativeApiError('validation');
        await onSaved();
      } catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause; }
    }, onClose, () => confirm === 'cancel' ? 'أُلغي التعويض.' : 'سُجل التعويض.');
  }
  function choose(selected: string) { if (!blocked) { setChosenDate(selected); setReason(''); mutation.reset(); } }
  return <>
    <FormDialog visible title={`تعويض — ${source?.student.name ?? student.name}`} busy={mutation.busy} onClose={close}
      footer={<View style={screenStyles.actions}>
        {needsRefresh ? <ActionButton label="تحديث البيانات للتحقق" loading={mutation.busy} onPress={() => { void mutation.reconcile(() => { setOutdated(false); onClose(); }); }} />
          : active ? canManage && <ActionButton label="إلغاء التعويض إداريًا" disabled={blocked || reason.trim().length < 3} onPress={() => setConfirm('cancel')} />
            : pending && <ActionButton label="تسجيل التعويض" disabled={blocked} onPress={() => setConfirm('grant')} />}
        <ActionButton label="إغلاق التعويض" secondary disabled={mutation.busy} onPress={close} />
      </View>}>
      <AppText>{compensationScopeLabel(scope)} • {formatHijriDate(chosenDate)}</AppText>
      <AppText>{scope === 'track' ? 'تُمنح درجة المقاطع كاملة، وتبقى درجة الحضور كما هي.' : 'تُمنح درجات الحفظ والربط والمراجعة والذاتي كاملة، ويبقى الحضور كما هو.'}</AppText>
      {resource.loading && <AppText accessibilityLiveRegion="polite">جارٍ تحميل التعويض…</AppText>}
      {!!resource.error && <><AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>
        <ActionButton label="إعادة تحميل التعويض" secondary disabled={mutation.busy} onPress={() => { if (needsRefresh) void mutation.reconcile(() => { setOutdated(false); onClose(); }); else void resource.reload(); }} /></>}
      {!!mutation.error && !confirm && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{mutation.error}</AppText>}
      {source && !resource.loading && !resource.error && <>
        <SectionCard title="الأيام المستحقة للتعويض">
          {!source.student.days.length && <AppText>لا توجد أيام مستحقة للتعويض.</AppText>}
          <View style={screenStyles.actions}>{source.student.days.slice(0, limit).map(day => <ActionButton key={day.date}
            label={`يوم ${day.dayNumber} — ${formatHijriDate(day.date)}`} accessibilityLabel={`تعويض يوم ${day.date}`}
            secondary={chosenDate !== day.date} disabled={blocked} onPress={() => choose(day.date)} />)}</View>
          {source.student.days.length > limit && <ActionButton label="عرض أيام أخرى" secondary disabled={blocked} onPress={() => setLimit(value => value + 30)} />}
        </SectionCard>
        {active && canManage && <FormField label="سبب الإلغاء الإداري" value={reason} onChangeText={setReason} maxLength={500} editable={!blocked} />}
        <SectionCard title="سجل التعويض">
          {!source.student.records.length && <AppText>لا يوجد تعويض مسجل في هذا الأسبوع.</AppText>}
          {source.student.records.map(row => <View key={row.id} style={[screenStyles.row, { borderColor: palette.border }]}>
            <AppText>{row.cancelledAt ? 'تعويض ملغى' : 'تعويض'} • {formatHijriDate(row.date)}</AppText>
            <AppText>{row.actorName} • {formatHijriDateTime(row.recordedAt)}</AppText>
            <AppText>مرجع الاستئذان: {row.excuseReference}</AppText>
            {row.cancelledAt && <AppText>ألغاه {row.cancelledByName} • {formatHijriDateTime(row.cancelledAt)} • {row.cancellationReason}</AppText>}
            {canManage && !row.cancelledAt && <ActionButton label={`تصحيح تعويض ${row.date}`} secondary disabled={blocked} onPress={() => choose(row.date)} />}
          </View>)}
        </SectionCard>
      </>}
    </FormDialog>
    <ConfirmDialog visible={!!confirm} title={confirm === 'cancel' ? 'إلغاء التعويض' : 'تسجيل التعويض'} busy={mutation.busy}
      message={confirm === 'cancel' ? `إلغاء تعويض ${formatHijriDate(active?.date)}؟ ستُستعاد درجات الإنجاز السابقة وتُحدّث النقاط، مع بقاء الحضور الحالي وسجل التعويض.`
        : `تعويض ${student.name} عن ${formatHijriDate(chosenDate)}؟ تُمنح درجات الإنجاز ويبقى الحضور كما هو.`}
      confirmLabel={needsRefresh ? 'تحديث البيانات للتحقق' : confirm === 'cancel' ? 'تأكيد إلغاء التعويض' : 'تأكيد التعويض'} error={mutation.error}
      onConfirm={() => { void save(); }} onClose={() => { if (needsRefresh) close(); else setConfirm(null); }} />
  </>;
}
