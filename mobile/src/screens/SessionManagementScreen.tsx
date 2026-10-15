import { useCallback, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { getBusinessDate, shiftDateOnly } from '../../../shared/business-date.js';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { canTestSession, sessionAttendanceStatus } from '../../../shared/session-attendance.js';
import { weekStartOf } from '../../../src/components/dashboard/grades/gradesFormat.js';
import { studentsToPrepare } from '../../../src/services/sessionAttendanceBatch.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { TrackSessionTestDialog } from '../components/session/TrackSessionTestDialog';
import { DayCompensationDialog } from '../components/compensation/DayCompensationDialog';
import { CompensationPolicyDialog } from '../components/compensation/CompensationPolicyDialog';
import { filterSessionStudents, sessionAttendanceDeletesEvaluation, sessionAttendanceOptions, sessionEditable,
  sessionRangeLabel, sessionTested, sessionTitles, type SessionAttempt, type SessionComponent, type SessionSegmentDraft, type SessionStudent } from '../domain/sessionManagement';
import { studentDate } from '../domain/studentDashboard';
import { attendanceLabels, type StudentAttendanceStatus } from '../domain/supervisorDashboard';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { NativeApiError } from '../services/nativeApi';
import type { SessionManagementApi } from '../services/sessionManagementApi';
import type { DayCompensationApi } from '../services/dayCompensationApi';
import { usePalette } from '../theme';
import { ManagementEmpty, ManagementPanel, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { DashboardButton } from '../components/dashboard/DashboardButton';

export function SessionManagementScreen({ api, component, compensationApi, onBack }: {
  api: SessionManagementApi; component: SessionComponent; compensationApi?: DayCompensationApi; onBack: () => void;
}) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const [requestedWeek, setRequestedWeek] = useState<string | undefined>(); const [circle, setCircle] = useState('all');
  const loader = useCallback((signal: AbortSignal) => api.load(component, requestedWeek, circle === 'all' ? undefined : Number(circle), signal), [api, component, requestedWeek, circle]);
  const resource = useLoadedResource(loader); const week = resource.value?.week; const circles = resource.value?.circles ?? [];
  const compensationScope = component === 'track' ? 'track' : 'program';
  const compensationWeekStart = week?.weekStart;
  const compensationLoader = useCallback((signal: AbortSignal) => compensationApi && compensationWeekStart && compensationApi.canUse(compensationScope)
    ? compensationApi.loadOverview(compensationScope, compensationWeekStart, signal) : Promise.resolve(null), [compensationApi, compensationScope, compensationWeekStart]);
  const compensation = useLoadedResource(compensationLoader);
  const reload = async () => { const results = await Promise.all([resource.reload(), compensation.reload()]); return results.every(Boolean); };
  const mutation = useVerifiedMutation(reload); const [outdated, setOutdated] = useState(false);
  const [compensationStudent, setCompensationStudent] = useState<{ id: number; name: string; date: string } | null>(null);
  const [compensationPolicy, setCompensationPolicy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [attendance, setAttendance] = useState<SessionStudent | null>(null); const [pending, setPending] = useState<{ student: SessionStudent; status: StudentAttendanceStatus } | null>(null);
  const [testing, setTesting] = useState<SessionStudent | null>(null); const [result, setResult] = useState<SessionStudent | null>(null);
  const [dateOpen, setDateOpen] = useState(false); const [date, setDate] = useState(''); const [validation, setValidation] = useState('');
  const today = getBusinessDate(); const needsRefresh = mutation.uncertain || outdated;
  const busy = mutation.busy; const blocked = busy || needsRefresh || resource.loading || !!resource.error;
  const editable = !!week && sessionEditable(week, today);
  const rows = filterSessionStudents(week?.students ?? [], '');
  const prepareCandidates = week ? studentsToPrepare(week.students.map(student => ({ ...student, grade: { [`${component}Detail`]: student.detail } })), component) : [];
  function closeDialogs() { setTesting(null); setPending(null); setAttendance(null); setResult(null); setOutdated(false); setValidation(''); }
  function close() { if (needsRefresh) void mutation.reconcile(closeDialogs); else { closeDialogs(); mutation.reset(); } }
  async function mutate(work: () => Promise<unknown>, message: (value: unknown) => string) {
    await mutation.run(async () => { try { return await work(); } catch (cause) {
      if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause;
    } }, closeDialogs, message);
  }
  function changeAttendance(student: SessionStudent, status: StudentAttendanceStatus) {
    if (!week || blocked || !editable) return;
    if (component === 'track' && sessionAttendanceDeletesEvaluation(student, status)) { setPending({ student, status }); return; }
    void mutate(() => api.setAttendance(week, student.id, status), () => `حُفظ حضور ${student.name}: ${attendanceLabels[status]}.`);
  }
  function saveTest(attempt: SessionAttempt, drafts: SessionSegmentDraft[]) {
    if (!week || blocked || !editable) return;
    void mutate(() => api.saveTest(week, attempt, drafts), () => 'حُفظ اختبار جلسة المسار.');
  }
  function moveWeek(next: string | undefined) { if (!blocked) { closeDialogs(); mutation.reset(); setRequestedWeek(next); } }
  const error = mutation.error || validation;
  return <ScreenLayout title={sessionTitles[component]} onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void reload(); }}>
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {!!error && !testing && !pending && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    <ManagementPanel><ManagementToolbar>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1, flexBasis: width < 640 ? '100%' : 420, minWidth: 0 }}>
        <View style={{ flexDirection: 'row-reverse', gap: 4, alignItems: 'center', flex: width < 640 ? 2 : undefined, minWidth: 0 }}>
          <DashboardButton iconOnly outlined iconSize={16} icon="chevronRight" label="الأسبوع السابق" disabled={blocked || !week?.hasPreviousWeek} onPress={() => { if (week) moveWeek(shiftDateOnly(week.weekStart, -7)); }} />
          <View style={{ minWidth: 0, flex: width < 640 ? 1 : undefined }}><ActionButton label={week ? formatHijriDate(week.periodStart, { month: 'numeric' }) : 'اختيار الأسبوع'}
            accessibilityLabel="اختيار الأسبوع" secondary disabled={blocked || !week} onPress={() => { setDate(week?.periodStart ?? ''); setDateOpen(true); setValidation(''); }} /></View>
          <DashboardButton iconOnly outlined iconSize={16} icon="chevronLeft" label="الأسبوع التالي" disabled={blocked || !week || week.weekStart >= week.currentWeekStart} onPress={() => { if (week) moveWeek(shiftDateOnly(week.weekStart, 7)); }} />
        </View>
        <DashboardSelect label="الحلقة" value={circles.find(item => String(item.id) === circle)?.name || 'كل الحلقات'} disabled={blocked} onPress={() => setFilterOpen(true)} />
      </View>
        {needsRefresh && <ActionButton label="تحديث الجلسة" secondary disabled={busy || resource.loading} onPress={() => {
          if (needsRefresh) void mutation.reconcile(closeDialogs); else void reload();
        }} />}
        <ActionButton label="تحضير الكل" disabled={blocked || !editable || !prepareCandidates.length} onPress={() => { if (week) void mutate(() => api.prepareAll(week), value => {
          const result = value as { saved: number; failed: number }; return `حُضّر ${result.saved} طالب${result.failed ? `، وتعذر تحضير ${result.failed}.` : '.'}`;
        }); }} />
        {compensationApi?.canEditPolicy() && <ActionButton label="التعويض والتجاوز" secondary disabled={blocked}
          onPress={() => setCompensationPolicy(true)} />}
      </ManagementToolbar>
      {!!compensation.error && <><AppText accessibilityRole="alert" style={{ color: palette.error }}>{compensation.error}</AppText>
        <ActionButton label="تحديث التعويض" secondary disabled={busy || compensation.loading} onPress={() => { void compensation.reload(); }} /></>}
      {needsRefresh && <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(closeDialogs); }} />}
      {!!week && !editable && <AppText>{week.seasonalHoliday ? 'لا يتاح التسجيل خلال عطلة الجلسة.' : 'لا يتاح التسجيل لهذه الجلسة حاليًا.'}</AppText>}
    {!resource.loading && !resource.error && !!week && <>
      {rows.length ? rows.map(student => <View key={student.id} style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        paddingHorizontal: width < 640 ? 16 : 24, paddingVertical: 12, borderBottomWidth: 1, borderColor: palette.border }}>
        <View style={{ flex: 1, minWidth: 100 }}><AppText style={{ fontFamily: 'CairoBlack', fontSize: 16, lineHeight: 22 }}>{student.name}</AppText>
          <AppText style={{ color: palette.muted, fontFamily: 'CairoBold', fontSize: width < 640 ? 10 : 12, lineHeight: 18 }}>{student.committeeName || 'بدون حلقة'}</AppText>
        </View>
        {student.detail && <Pressable accessibilityRole="button" accessibilityLabel={`نتيجة ${student.name}`} disabled={busy} onPress={() => setResult(student)}>
          <AppText style={{ fontFamily: 'CairoBlack', fontSize: 14, writingDirection: 'ltr' }}>{student.grade.grade}/{student.grade.max}</AppText></Pressable>}
        <View style={[screenStyles.actions, { gap: 8 }]}><DashboardSelect controlWidth={144} label={`حضور ${student.name} ${sessionTitles[component]}`}
          value={sessionAttendanceStatus(student.detail ?? {}) ? attendanceLabels[sessionAttendanceStatus(student.detail ?? {}) as StudentAttendanceStatus] : 'اختر الحالة'} disabled={blocked || !editable}
          onPress={() => { mutation.reset(); setAttendance(student); }} />
          {component === 'track' && canTestSession(student.detail) && week.policy.trackSession.segmentCount > 0 && <ActionButton
            label={sessionTested(student) ? 'إعادة الاختبار' : 'اختبر'} accessibilityLabel={`${sessionTested(student) ? 'إعادة اختبار' : 'اختبار'} ${student.name}`} secondary={sessionTested(student)}
            disabled={blocked || !editable || student.detail?.operationType === 'compensation'} onPress={() => { mutation.reset(); setTesting(student); }} />}
          {!!compensationApi && !!compensation.value?.students.find(row => row.id === student.id)?.days.length && <ActionButton
            label="تعويض" accessibilityLabel={`تعويض ${student.name}`} secondary disabled={blocked || compensation.loading || !!compensation.error || !editable}
            onPress={() => { const selected = compensation.value?.students.find(row => row.id === student.id);
              if (selected?.days[0]) setCompensationStudent({ id: student.id, name: student.name, date: selected.days[0].date }); }} />}
          {!!compensationApi && compensation.value?.canManage && !!compensation.value.students.find(row => row.id === student.id)?.records.length && <ActionButton
            label="سجل التعويض" accessibilityLabel={`سجل تعويض ${student.name}`} secondary disabled={blocked || compensation.loading || !!compensation.error}
            onPress={() => { const selected = compensation.value?.students.find(row => row.id === student.id); const first = selected?.records[0];
              if (first) setCompensationStudent({ id: student.id, name: student.name, date: first.date }); }} />}
        </View>
      </View>) : <ManagementEmpty>لا يوجد طلاب مطابقون.</ManagementEmpty>}
    </>}
    </ManagementPanel>
    <ChoiceDialog visible={!!attendance} title={`حضور ${attendance?.name ?? 'الطالب'}`} value={sessionAttendanceStatus(attendance?.detail ?? {}) ?? ''}
      options={sessionAttendanceOptions} onChoose={value => { if (attendance) changeAttendance(attendance, value as StudentAttendanceStatus); }} onClose={() => setAttendance(null)} />
    <ChoiceDialog visible={filterOpen} title="اختر الحلقة" value={circle} options={[{ value: 'all', label: 'كل الحلقات' }, ...circles.map(item => ({ value: String(item.id), label: item.name }))]}
      onChoose={value => { if (!blocked) { closeDialogs(); mutation.reset(); setCircle(value); } }} onClose={() => setFilterOpen(false)} />
    <ConfirmDialog visible={!!pending} title="تغيير حالة الطالب" message="سيُحذف تقييم المقاطع الحالي وتُحدّث الدرجة والنقاط. هل تريد المتابعة؟"
      busy={busy} error={error} confirmLabel={needsRefresh ? 'تحديث البيانات للتحقق' : 'تأكيد تغيير الحضور'} onClose={close} onConfirm={() => {
        if (needsRefresh) void mutation.reconcile(closeDialogs);
        else if (pending && week) void mutate(() => api.setAttendance(week, pending.student.id, pending.status, true), () => 'حُفظ الحضور وأُزيل تقييم المقاطع السابق.');
      }} />
    <FormDialog visible={dateOpen} title="اختيار الأسبوع" onClose={() => setDateOpen(false)} footer={<><ActionButton label="الأسبوع الحالي" secondary disabled={blocked} onPress={() => { moveWeek(undefined); setDateOpen(false); }} /><ActionButton label="عرض الأسبوع" onPress={() => {
      try { studentDate(date); moveWeek(weekStartOf(date)); setDateOpen(false); setValidation(''); } catch { setValidation('أدخل تاريخًا صحيحًا بصيغة سنة-شهر-يوم.'); }
    }} /></>}>
      <FormField label="تاريخ الجلسة" value={date} onChangeText={setDate} maxLength={10} hint="سنة-شهر-يوم" />
      {!!validation && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{validation}</AppText>}
    </FormDialog>
    <FormDialog visible={!!result} title={`نتيجة ${result?.name ?? 'الطالب'}`} onClose={() => setResult(null)}>
      {!!result?.detail && <><AppText>{sessionAttendanceStatus(result.detail) ? attendanceLabels[sessionAttendanceStatus(result.detail) as StudentAttendanceStatus] : 'لم يُسجّل الحضور'}</AppText>
        <AppText>الدرجة: {result.grade.grade}/{result.grade.max}</AppText>
        {result.detail.segments.map(segment => <SectionCard key={segment.index} title={`المقطع ${segment.index}`}>
          <AppText>{segment.source === 'review' ? 'مراجعة' : 'ربط'} • {sessionRangeLabel(segment.range)}</AppText>
          <AppText>{segment.recorded ? `الدرجة ${segment.grade}/${segment.max}` : 'لم يُختبر المقطع بعد.'}</AppText>
          {segment.recorded && <AppText>الأخطاء {segment.mistakes} • الترددات {segment.hesitations} • التنبيهات {segment.warnings}</AppText>}
        </SectionCard>)}</>}
    </FormDialog>
    {!!testing && !!week && <TrackSessionTestDialog key={`${week.weekStart}:${testing.id}`} api={api} week={week} student={testing}
      busy={busy} blocked={needsRefresh} error={mutation.error} onClose={close} onReconcile={() => { void mutation.reconcile(closeDialogs); }} onSave={saveTest} />}
    {!!compensationStudent && !!compensationApi && <DayCompensationDialog key={`${compensationScope}:${compensationStudent.id}`}
      api={compensationApi} scope={compensationScope} student={compensationStudent} date={compensationStudent.date}
      onSaved={reload} onClose={() => setCompensationStudent(null)} />}
    {compensationPolicy && !!compensationApi && <CompensationPolicyDialog api={compensationApi} onSaved={reload} onClose={() => setCompensationPolicy(false)} />}
  </ScreenLayout>;
}
