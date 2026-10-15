import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { canCreatePassingExam, passingRangeLabel, passingReportPart, passingStatusLabels, passingTypes,
  type PassingReportPart, type PassingStudent, type PassingType } from '../../domain/passingManagement';
import type { PassingManagementApi } from '../../services/passingManagementApi';
import { NativeApiError } from '../../services/nativeApi';
import { useLoadedResource } from '../../hooks/useLoadedResource';
import { useVerifiedMutation } from '../../hooks/useVerifiedMutation';
import { usePalette } from '../../theme';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { PassingAttemptReportDialog, PassingResultSummary } from './PassingAttemptReportDialog';

export function PassingStudentPartsDialog({ api, student, type, onClose }: {
  api: PassingManagementApi; student: PassingStudent; type: PassingType; onClose: () => void;
}) {
  const palette = usePalette(); const loader = useCallback((signal: AbortSignal) => api.parts(student.id, type, signal), [api, student.id, type]);
  const resource = useLoadedResource(loader); const mutation = useVerifiedMutation(resource.reload);
  const [outdated, setOutdated] = useState(false); const [report, setReport] = useState<PassingReportPart | null>(null);
  const snapshot = resource.value; const needsRefresh = mutation.uncertain || outdated;
  const blocked = mutation.busy || needsRefresh || resource.loading || !!resource.error;
  function reconciled() { setOutdated(false); setReport(null); }
  function refresh() { if (needsRefresh) void mutation.reconcile(reconciled); else void resource.reload(); }
  function close() { if (needsRefresh) void mutation.reconcile(reconciled); else onClose(); }
  function create(juz?: number) {
    if (!snapshot || blocked || !canCreatePassingExam(snapshot, juz)) return;
    void mutation.run(async () => {
      try { return await api.create(snapshot, juz); }
      catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause; }
    }, reconciled, () => 'أُنشئ الاختبار وحُفظ نطاقه.');
  }
  const historyJuz = snapshot ? [...new Set(snapshot.exams.flatMap(exam => exam.parts.map(part => part.juzNumber)))].sort((a, b) => a - b) : [];
  return <>
    <FormDialog visible={!report} title={`${student.name}، ${passingTypes[type]}`} onClose={close} busy={mutation.busy}>
      <View style={screenStyles.actions}><ActionButton label={needsRefresh ? 'تحديث البيانات للتحقق' : 'تحديث الاجتياز'} secondary
        disabled={mutation.busy || resource.loading} onPress={refresh} /></View>
      {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
      {!!mutation.error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{mutation.error}</AppText>}
      {!!resource.error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>}
      {resource.loading && <><ActivityIndicator color={palette.primary} /><AppText>جارٍ التحميل</AppText></>}
      {!!snapshot && !resource.loading && !resource.error && <>
        {!snapshot.parts.length && <AppText>{type === 'branch' ? 'لم يُكمل الطالب جزءًا كاملًا معتمدًا ضمن خطته.' : 'لا يوجد جزء محفوظ كامل ومعتمد لهذا الطالب.'}</AppText>}
        {type === 'hafiz' && !!snapshot.parts.length && <ActionButton label="إنشاء اختبار الحافظ" disabled={blocked || !canCreatePassingExam(snapshot)} onPress={() => create()} />}
        {snapshot.parts.map(part => <SectionCard key={part.juzNumber} title={`الجزء ${part.juzNumber}`}>
          {part.ranges.map((range, index) => <AppText key={index}>{passingRangeLabel(range)}</AppText>)}
          {type === 'branch' && <ActionButton label={`إنشاء اختبار الجزء ${part.juzNumber}`} disabled={blocked || !canCreatePassingExam(snapshot, part.juzNumber)} onPress={() => create(part.juzNumber)} />}
        </SectionCard>)}
        {!!snapshot.exams.length && <AppText style={screenStyles.bold}>الاختبارات المحفوظة</AppText>}
        {snapshot.exams.map(exam => <SectionCard key={exam.id} title={`اختبار ${exam.id} · ${passingStatusLabels[exam.status]}`}>
          <AppText>{formatHijriDate(exam.createdAt.slice(0, 10))}</AppText>
          {exam.parts.map(part => <View key={part.id} style={[screenStyles.row, { borderColor: palette.border }]}>
            <AppText style={screenStyles.bold}>الجزء {part.juzNumber}</AppText>
            {part.ranges.map((range, index) => <AppText key={index}>{passingRangeLabel(range)}</AppText>)}
            {part.latestAttempt ? <PassingResultSummary result={part.latestAttempt.result} /> : <AppText>لم يُقيّم</AppText>}
            {part.latestAttempt?.rehifzDecision === 'pending' && <AppText>قرار إعادة الحفظ لم يُحدد بعد</AppText>}
          </View>)}
        </SectionCard>)}
        {historyJuz.map(juz => {
          const part = passingReportPart(snapshot, juz); return part?.attempts.length ? <ActionButton key={juz} label={`تقرير الجزء ${juz} (${part.attempts.length})`}
            secondary disabled={blocked} onPress={() => setReport(part)} /> : null;
        })}
      </>}
    </FormDialog>
    <PassingAttemptReportDialog part={report} onClose={() => setReport(null)} />
  </>;
}
