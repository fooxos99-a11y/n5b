import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { AppText } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { DashboardButton } from '../components/dashboard/DashboardButton';
import { DashboardIcon } from '../components/dashboard/DashboardIcon';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { DayCompensationDialog } from '../components/compensation/DayCompensationDialog';
import type { CompensationOverview } from '../domain/dayCompensation';
import { attendanceLabels, filterLabels, filterSupervisorStudents, supervisorReadingAmount, supervisorTaskAmount,
  supervisorTaskStatusLabel, taskLabels, type StaffAttendance, type StudentAttendanceStatus, type SupervisorEvaluation,
  type SupervisorHistoryRow, type SupervisorStatusFilter, type SupervisorStudent, type SupervisorTask } from '../domain/supervisorDashboard';
import type { NativeSession, NativeSessionController } from '../domain/nativeSession';
import { AttendanceLocationError } from '../domain/attendanceLocation';
import { NativeApiError } from '../services/nativeApi';
import { createSupervisorDashboardApi } from '../services/supervisorDashboardApi';
import { createDayCompensationApi } from '../services/dayCompensationApi';
import { usePalette } from '../theme';

type Dashboard = { evaluation: SupervisorEvaluation; staff: StaffAttendance; roster: readonly SupervisorStudent[] };
type AttendanceChoice = { studentId: number; name: string; status: StudentAttendanceStatus };
export interface SupervisorDashboardScreenProps {
  session: NativeSession; controller: NativeSessionController; onLogout: () => void; onBack?: () => void;
  getCoordinates?: () => Promise<{ latitude: number; longitude: number }>;
}
function TaskDetails({ task }: { task: SupervisorTask }) {
  const palette = usePalette();
  return <View style={[screenStyles.row, { borderColor: palette.border, paddingVertical: 8, gap: 4 }]}>
    <AppText style={{ fontFamily: 'CairoBold', fontSize: 13, lineHeight: 22 }}>{taskLabels[task.taskType]}{task.trackLabel ? ` — ${task.trackLabel}` : ''}</AppText>
    <AppText style={{ fontSize: 12, lineHeight: 22 }}>{supervisorTaskAmount(task)}</AppText>
    {!!task.pagePreview && task.pagePreview !== supervisorTaskAmount(task) && <AppText style={{ color: palette.muted }}>{task.pagePreview}</AppText>}
    {task.targetPages !== null && <AppText>المقدار المخطط: {task.targetPages} وجه</AppText>}
    <AppText>{supervisorTaskStatusLabel(task)}</AppText>
    {task.evaluationScore !== null && task.evaluationMaxScore !== null && <AppText>الدرجة: {task.evaluationScore} / {task.evaluationMaxScore}</AppText>}
    {task.teacherCompleted !== null && <AppText>الأخطاء: {task.mistakeCount}، التنبيهات: {task.warningCount}، الترددات: {task.hesitationCount}</AppText>}
  </View>;
}
export function SupervisorDashboardScreen({ session, controller, onLogout, onBack, getCoordinates }: SupervisorDashboardScreenProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const api = useMemo(() => createSupervisorDashboardApi(session, controller), [controller, session]);
  const compensationApi = useMemo(() => {
    const identity = controller.getSnapshot().session;
    if (identity?.id !== session.id || identity.role !== session.role || identity.complex.registrationNumber !== session.complex.registrationNumber) throw new NativeApiError('cancelled');
    return createDayCompensationApi(controller);
  }, [controller, session.id, session.role, session.complex.registrationNumber]);
  const [compensation, setCompensation] = useState<CompensationOverview | null>(null);
  const [compensationError, setCompensationError] = useState('');
  const [compensationStudent, setCompensationStudent] = useState<{ id: number; name: string; date: string } | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SupervisorStatusFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [attendanceStudent, setAttendanceStudent] = useState<number | null>(null);
  const [attendanceChoice, setAttendanceChoice] = useState<AttendanceChoice | null>(null);
  const [staffConfirm, setStaffConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [historyChoicesOpen, setHistoryChoicesOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<SupervisorStudent | null>(null);
  const [historyRows, setHistoryRows] = useState<readonly SupervisorHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const scopeEpoch = useRef(0);
  const loadEpoch = useRef(0);
  const historyEpoch = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const selectedDate = useRef<string | undefined>(undefined);
  const locked = useRef(false);
  const load = useCallback(async (date?: string) => {
    loadAbort.current?.abort();
    const abort = new AbortController(); loadAbort.current = abort;
    const epoch = ++loadEpoch.current;
    setLoading(true); setLoadError(null); setCompensationError('');
    try {
      const [evaluation, staff, roster] = await Promise.all([api.loadEvaluation({ date, signal: abort.signal }),
        api.loadStaffAttendance(abort.signal), api.loadRoster(abort.signal)]);
      if (epoch !== loadEpoch.current || abort.signal.aborted) return;
      selectedDate.current = date;
      setDashboard({ evaluation, staff, roster });
      try {
        const overview = compensationApi.canUse('program') ? await compensationApi.loadOverview('program', evaluation.date, abort.signal) : null;
        if (epoch === loadEpoch.current && !abort.signal.aborted) setCompensation(overview);
      } catch (cause) {
        if (epoch === loadEpoch.current && !abort.signal.aborted) setCompensationError(cause instanceof Error ? cause.message : 'تعذّر تحميل التعويض.');
      }
    } catch (error) {
      if (epoch === loadEpoch.current && !abort.signal.aborted) setLoadError(error instanceof NativeApiError
        ? error.message : 'تعذّر تحميل مساحة المشرف. أعد المحاولة.');
    } finally { if (epoch === loadEpoch.current && !abort.signal.aborted) setLoading(false); }
  }, [api, compensationApi]);
  useEffect(() => {
    scopeEpoch.current += 1;
    setDashboard(null); setCompensation(null); setCompensationStudent(null); setExpanded(null); setQuery(''); setFilter('all'); setNotice('');
    setHistoryStudent(null); setHistoryRows([]); setAttendanceChoice(null); setAttendanceStudent(null); setStaffConfirm(false);
    locked.current = false; setBusy(false); setActionError(null); setFilterOpen(false); setHistoryChoicesOpen(false);
    setHistoryError(null); setHistoryLoading(false);
    selectedDate.current = undefined; void load();
    return () => {
      scopeEpoch.current += 1; loadEpoch.current += 1; historyEpoch.current += 1;
      loadAbort.current?.abort(); historyAbort.current?.abort();
    };
  }, [load]);
  const students = useMemo(() => dashboard ? filterSupervisorStudents(dashboard.evaluation, query, filter) : [], [dashboard, query, filter]);
  async function commitAttendance() {
    if (!dashboard || locked.current || !attendanceChoice) return;
    locked.current = true; setBusy(true); setActionError(null); setNotice('');
    const epoch = scopeEpoch.current;
    try {
      await api.setStudentAttendance(dashboard.evaluation, attendanceChoice.studentId, attendanceChoice.status);
      if (epoch !== scopeEpoch.current) return;
      setAttendanceChoice(null); setNotice('حُفظ حضور الطالب على الخادم.');
      await load(selectedDate.current);
    } catch (error) {
      if (epoch === scopeEpoch.current) setActionError(error instanceof NativeApiError ? error.message : 'تعذّر حفظ الحضور. حاول مجددًا.');
    } finally { if (epoch === scopeEpoch.current) { locked.current = false; setBusy(false); } }
  }
  async function checkIn() {
    if (!dashboard || locked.current) return;
    locked.current = true; setBusy(true); setActionError(null); setNotice('');
    const epoch = scopeEpoch.current;
    try {
      let coordinates: { latitude: number; longitude: number } | undefined;
      if (dashboard.staff.policy?.locationRequired) {
        if (!getCoordinates) throw new NativeApiError('validation');
        coordinates = await getCoordinates();
      }
      await api.checkInStaffAttendance(dashboard.staff, coordinates);
      if (epoch !== scopeEpoch.current) return;
      setStaffConfirm(false); setNotice('سُجل تحضيرك على الخادم.'); await load(selectedDate.current);
    } catch (error) {
      if (epoch === scopeEpoch.current) setActionError(error instanceof NativeApiError || error instanceof AttendanceLocationError ? error.message
        : 'تعذّر إكمال التحضير. تحقق من إذن الموقع وأعد المحاولة.');
    } finally { if (epoch === scopeEpoch.current) { locked.current = false; setBusy(false); } }
  }
  async function openHistory(student: SupervisorStudent) {
    historyAbort.current?.abort();
    const abort = new AbortController(); historyAbort.current = abort;
    const epoch = ++historyEpoch.current;
    setHistoryStudent(student); setHistoryRows([]); setHistoryError(null); setHistoryLoading(true);
    try {
      const rows = await api.loadStudentHistory(student.id, abort.signal);
      if (epoch === historyEpoch.current && !abort.signal.aborted) setHistoryRows(rows);
    } catch (error) {
      if (epoch === historyEpoch.current && !abort.signal.aborted) setHistoryError(error instanceof NativeApiError ? error.message : 'تعذّر تحميل الجلسات السابقة.');
    } finally { if (epoch === historyEpoch.current && !abort.signal.aborted) setHistoryLoading(false); }
  }
  function closeHistory() { historyEpoch.current += 1; historyAbort.current?.abort(); setHistoryStudent(null); setHistoryRows([]); }
  const staff = dashboard?.staff;
  const locationUnavailable = Boolean(staff?.policy?.locationRequired && !getCoordinates);
  const studentForAttendance = dashboard?.evaluation.students.find(student => student.id === attendanceStudent);
  return <ScreenLayout title="جلسات التسميع" onBack={onBack} loading={loading} error={loadError}
    onRetry={() => { if (!locked.current) void load(selectedDate.current); }} actions={<View style={screenStyles.actions}>
      <DashboardButton iconOnly icon="refresh" label="تحديث البيانات" disabled={busy || loading} onPress={() => { void load(selectedDate.current); }} />
      <DashboardButton iconOnly icon="logout" label="تسجيل الخروج" disabled={busy} onPress={onLogout} />
    </View>}>
    {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    {!!compensationError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{compensationError}</AppText>}
    {dashboard && <>
      <AppText style={{ fontSize: 12, lineHeight: 20, color: palette.muted }}>{session.name} · {session.complex.name} · {dashboard.evaluation.date}</AppText>
      {staff?.enabled && <SectionCard title="تحضير المشرف">
        <AppText>{staff.alreadyPresent ? `سُجل تحضيرك${staff.checkInTime ? ` الساعة ${staff.checkInTime}` : ''}.`
          : !staff.enabled ? 'التحضير مسجل عن طريق المشرف.' : !staff.canAttend ? 'لا يوجد تحضير متاح في هذا اليوم.' : 'يمكنك تسجيل تحضيرك الآن.'}</AppText>
        {staff.policy?.locationRequired && <AppText style={{ color: palette.muted }}>يتطلب التحضير التحقق من وجودك في الموقع المحدد.</AppText>}
        {locationUnavailable && <AppText>الوصول للموقع غير متاح في هذه النسخة.</AppText>}
        {staff.enabled && <ActionButton label="تسجيل تحضيري" disabled={busy || loading || !!loadError || !staff.canAttend || locationUnavailable}
          onPress={() => { setActionError(null); setStaffConfirm(true); }} />}
      </SectionCard>}
      <View style={{ gap: width >= 640 ? 10 : 7 }}>
        <View style={[screenStyles.actions, { alignItems: 'center' }]}>
          <View style={{ flex: 1, flexBasis: width < 640 ? '100%' : 240, minWidth: 0 }}><FormField label="بحث عن طالب" hideLabel compact placeholder="الاسم أو الحلقة" value={query} onChangeText={setQuery} maxLength={120} /></View>
          <DashboardSelect label={`الحالة: ${filterLabels[filter]}`} value={filterLabels[filter]} onPress={() => setFilterOpen(true)} controlWidth={width >= 640 ? 180 : 140} />
          <DashboardButton icon="history" label="الجلسات السابقة" disabled={busy || loading || !!loadError}
            onPress={() => setHistoryChoicesOpen(true)} />
          {dashboard.evaluation.previousSessionDate && <DashboardButton icon="chevronRight" label="الجلسة السابقة" disabled={busy || loading}
            onPress={() => { setExpanded(null); void load(dashboard.evaluation.previousSessionDate ?? undefined); }} />}
          {selectedDate.current && <DashboardButton icon="weeklySession" label="جلسة اليوم" disabled={busy || loading}
            onPress={() => { setExpanded(null); void load(); }} />}
        </View>
        {!students.length && !loading && <AppText>{query || filter !== 'all' ? 'لا يوجد طلاب يطابقون البحث.' : 'لا توجد مهام تسميع متاحة في هذا اليوم.'}</AppText>}
        {students.map(student => {
          const tasks = dashboard.evaluation.tasks.filter(task => task.studentId === student.id);
          const reading = dashboard.evaluation.reading.find(item => item.studentId === student.id);
          const attendanceEditable = dashboard.evaluation.recitationAttendanceSource === 'teacher' && student.canSetAttendance;
          return <View key={student.id} style={{ minWidth: 0, borderWidth: 1, borderColor: `${palette.primary}09`, borderRadius: 12, backgroundColor: palette.card,
            boxShadow: `0 5px 20px ${palette.primary}0b`, padding: width >= 640 ? 10 : 6, gap: 3 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: width >= 640 ? 10 : 7 }}>
                <View style={{ width: width >= 640 ? 30 : 26, height: width >= 640 ? 30 : 26, borderRadius: 15,
                  backgroundColor: `${palette.primary}11`, alignItems: 'center', justifyContent: 'center' }}><DashboardIcon name="account" color={palette.primary} size={width >= 640 ? 19 : 17} /></View>
                <AppText style={{ fontFamily: 'CairoBold', fontSize: width >= 640 ? 14 : 13, lineHeight: 20, flexShrink: 1 }}>{student.name}</AppText>
              </View>
              {attendanceEditable ? <DashboardSelect label={`تحضير ${student.name}`} value={student.attendanceStatus ? attendanceLabels[student.attendanceStatus] : 'الحضور'}
                controlWidth={width >= 640 ? 98 : 82} disabled={busy || loading || !!loadError}
                onPress={() => { setActionError(null); setAttendanceStudent(student.id); }} />
                : <AppText style={{ fontSize: 12, color: palette.muted }}>{student.attendanceStatus ? attendanceLabels[student.attendanceStatus] : 'لم يحدد'}</AppText>}
            </View>
            <View style={[screenStyles.actions, { alignItems: 'center', gap: 4 }]}>
              <DashboardButton iconOnly icon={expanded === student.id ? 'eyeOff' : 'eye'} label={`${expanded === student.id ? 'إخفاء' : 'تفاصيل'} مقادير ${student.name}`}
                onPress={() => setExpanded(current => current === student.id ? null : student.id)} />
              {!!compensation?.students.find(row => row.id === student.id)?.days.length && <DashboardButton icon="quranPassing" label={`تعويض ${student.name}`}
                disabled={busy || loading || !!loadError || !!compensationError} onPress={() => {
                  const selected = compensation?.students.find(row => row.id === student.id); const first = selected?.days[0];
                  if (first) setCompensationStudent({ id: student.id, name: student.name, date: first.date });
                }} />}
              {compensation?.canManage && !!compensation.students.find(row => row.id === student.id)?.records.length && <DashboardButton icon="history" label={`سجل تعويض ${student.name}`}
                disabled={busy || loading || !!loadError || !!compensationError} onPress={() => {
                  const selected = compensation?.students.find(row => row.id === student.id); const first = selected?.records[0];
                  if (first) setCompensationStudent({ id: student.id, name: student.name, date: first.date });
                }} />}
            </View>
            {student.recitationFinished && <AppText style={{ fontSize: 12, color: palette.muted }}>اكتمل التسميع</AppText>}
            {expanded === student.id && <>
              <AppText style={{ fontSize: 12, color: palette.muted }}>{student.committeeName}</AppText>
              {tasks.map(task => <TaskDetails key={task.id} task={task} />)}
              {reading && <View style={screenStyles.row}><AppText style={screenStyles.bold}>القراءة الذاتية</AppText>
                <AppText>{supervisorReadingAmount(reading)}</AppText><AppText>{reading.status === 'read' ? 'قرأ' : reading.status === 'missed' ? 'لم يقرأ' : 'لم تسجل القراءة بعد.'}</AppText></View>}
              {!tasks.length && !reading && !student.recitationFinished && <AppText>لا يوجد مقدار متاح لهذا الطالب.</AppText>}
            </>}
          </View>;
        })}
      </View>
    </>}
    <ChoiceDialog visible={filterOpen} title="تصفية حالات المهام" value={filter} onClose={() => setFilterOpen(false)}
      options={Object.entries(filterLabels).map(([value, label]) => ({ value, label }))}
      onChoose={value => { if (value in filterLabels) setFilter(value as SupervisorStatusFilter); }} />
    <ChoiceDialog visible={attendanceStudent !== null} title={`تحضير ${studentForAttendance?.name ?? 'الطالب'}`}
      value={studentForAttendance?.attendanceStatus ?? undefined} onClose={() => setAttendanceStudent(null)}
      options={Object.entries(attendanceLabels).map(([value, label]) => ({ value, label }))}
      onChoose={value => {
        if (studentForAttendance && value in attendanceLabels) setAttendanceChoice({ studentId: studentForAttendance.id,
          name: studentForAttendance.name, status: value as StudentAttendanceStatus });
      }} />
    <ConfirmDialog visible={attendanceChoice !== null} title="تأكيد حضور الطالب"
      message={attendanceChoice ? `تسجيل ${attendanceChoice.name} بحالة «${attendanceLabels[attendanceChoice.status]}» في ${dashboard?.evaluation.date}؟` : ''}
      confirmLabel="حفظ الحضور" busy={busy} error={actionError} onConfirm={() => { void commitAttendance(); }}
      onClose={() => { if (!busy) setAttendanceChoice(null); }} />
    <ConfirmDialog visible={staffConfirm} title="تسجيل تحضيرك" message="تسجيل تحضيرك لهذا اليوم؟"
      confirmLabel="تأكيد التحضير" busy={busy} error={actionError} onConfirm={() => { void checkIn(); }}
      onClose={() => { if (!busy) setStaffConfirm(false); }} />
    <ChoiceDialog visible={historyChoicesOpen} title="اختر طالبًا لعرض جلساته السابقة" onClose={() => setHistoryChoicesOpen(false)}
      options={(dashboard?.roster ?? []).map(student => ({ value: String(student.id), label: `${student.name} — ${student.committeeName}` }))}
      onChoose={value => { const student = dashboard?.roster.find(item => String(item.id) === value); if (student) void openHistory(student); }} />
    <FormDialog visible={historyStudent !== null} title={`جلسات ${historyStudent?.name ?? 'الطالب'} السابقة`} onClose={closeHistory}>
      {historyLoading && <ActivityIndicator color={palette.primary} />}
      {!!historyError && <><AppText accessibilityRole="alert">{historyError}</AppText>
        <ActionButton label="إعادة المحاولة" secondary onPress={() => { if (historyStudent) void openHistory(historyStudent); }} /></>}
      {!historyLoading && !historyError && !historyRows.length && <AppText>لا توجد جلسات تسميع سابقة.</AppText>}
      {historyRows.map(row => <SectionCard key={`${row.sessionId}:${row.id}:${row.attemptNumber}`} title={`${row.sessionDate} — ${row.teacherName}`}>
        <TaskDetails task={row} />
      </SectionCard>)}
    </FormDialog>
    {!!compensationStudent && <DayCompensationDialog key={compensationStudent.id} api={compensationApi} scope="program" student={compensationStudent}
      date={compensationStudent.date} onSaved={() => load(selectedDate.current)} onClose={() => setCompensationStudent(null)} />}
  </ScreenLayout>;
}
