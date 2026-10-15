import { useCallback, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { formatClockTime } from '../../../shared/clock-time.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { HijriDatePicker } from '../components/HijriDatePicker';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { AttendanceBatchError, attendancePolicyDraft, attendanceStatusLabel, attendanceStatusOptions,
  filterAttendanceRows, initialAttendanceQuery, type AttendanceBatchResult, type AttendancePolicyDraft, type AttendancePolicySource,
  normalizeAttendanceQuery, type AttendanceQuery, type AttendanceRow } from '../domain/attendanceManagement';
import type { StudentAttendanceStatus } from '../domain/supervisorDashboard';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import type { AttendanceManagementApi } from '../services/attendanceManagementApi';
import { NativeApiError } from '../services/nativeApi';
import { usePalette } from '../theme';
import { DashboardButton } from '../components/dashboard/DashboardButton';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { ManagementEmpty, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';

const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function AttendanceManagementScreen({ api, onBack }: { api: AttendanceManagementApi; onBack: () => void }) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const [query, setQuery] = useState(initialAttendanceQuery); const [dateDraft, setDateDraft] = useState(query.date);
  const [fromDraft, setFromDraft] = useState(query.from); const [toDraft, setToDraft] = useState(query.to);
  const loader = useCallback((signal: AbortSignal) => api.load(query, signal), [api, query]); const resource = useLoadedResource(loader);
  const mutation = useVerifiedMutation(resource.reload); const data = resource.value;
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('all'); const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<{ rows: AttendanceRow[]; status: StudentAttendanceStatus } | null>(null);
  const [bulkStatus, setBulkStatus] = useState<StudentAttendanceStatus>('present'); const [batch, setBatch] = useState<AttendanceBatchResult | null>(null);
  const [choice, setChoice] = useState<'circle' | 'staff' | 'statusFilter' | 'bulkStatus' | null>(null);
  const [policy, setPolicy] = useState<AttendancePolicySource | null>(null); const [policyLoading, setPolicyLoading] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<AttendancePolicyDraft>({ staffAttendanceSource: 'supervisor', recitationAttendanceSource: 'supervisor', lateMinutes: '' });
  const [localError, setLocalError] = useState(''); const [outdated, setOutdated] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false); const [batchOpen, setBatchOpen] = useState(false);
  const [rowChoice, setRowChoice] = useState<AttendanceRow | null>(null); const [targetChoice, setTargetChoice] = useState(false);
  const locked = mutation.busy || mutation.uncertain || outdated || policyLoading;
  const blocked = locked || resource.loading || !!resource.error;
  const visible = filterAttendanceRows(data?.rows ?? [], search, statusFilter); const circles = data?.circles ?? [];
  const people = [...new Map((data?.rows ?? []).map(row => [String(row.id), { value: String(row.id), label: row.name }])).values()];
  const selectedRows = (data?.rows ?? []).filter(row => selected.includes(row.key) && api.canSet(data!, row));
  function changeQuery(patch: Partial<AttendanceQuery>) {
    if (locked) return;
    try {
      const next = normalizeAttendanceQuery({ ...query, ...patch }); setQuery(next);
      setSelected([]); setBatch(null); setLocalError(''); setLimit(50); mutation.reset();
    } catch { setLocalError('اختر تاريخًا صحيحًا وفترة لا تتجاوز سنة.'); }
  }
  function closeAll() { setAction(null); setPolicy(null); setOutdated(false); setLocalError(''); mutation.reset(); }
  async function reconcile() { await mutation.reconcile(() => { closeAll(); setSelected([]); setBatch(null); }); }
  async function saveAttendance() {
    if (!action || !data) return;
    if (mutation.uncertain || outdated) { await reconcile(); return; }
    await mutation.run(async () => {
      try { const result = await api.saveAttendance(data, action.rows, action.status); setBatch(result); setSelected(result.failed.map(row => row.key)); return result; }
      catch (cause) { if (cause instanceof AttendanceBatchError) setBatch(cause.result); throw cause; }
    }, () => setAction(null), value => {
      const result = value as AttendanceBatchResult;
      return result.failed.length ? `حُفظت حالات: ${result.saved.length}. تعذّر حفظ حالات: ${result.failed.length}.`
        : `حُفظت حالات: ${result.saved.length}. حالات لم تتغير: ${result.skipped.length}.`;
    });
  }
  async function openPolicy() {
    if (blocked) return; setPolicyLoading(true); setLocalError('');
    try { const source = await api.loadPolicy(); setPolicy(source); setPolicyDraft(attendancePolicyDraft(source.policy)); mutation.reset(); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'تعذّر تحميل السياسة.'); }
    finally { setPolicyLoading(false); }
  }
  const statuses = [{ value: 'all', label: 'كل الحالات' }, { value: 'unrecorded', label: 'لم يُحضّر' }, ...attendanceStatusOptions];
  const options = choice === 'circle' ? [{ value: 'all', label: 'كل الحلقات' }, ...circles.map(circle => ({ value: String(circle.id), label: circle.name }))]
    : choice === 'staff' ? [{ value: 'all', label: 'كل الموظفين' }, ...people] : choice === 'statusFilter' ? statuses : attendanceStatusOptions;
  return <ScreenLayout title="التحضير" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {!!localError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{localError}</AppText>}
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}><AppText style={{ fontFamily: 'CairoBlack', fontSize: 12 }}>
        {query.target === 'students' ? 'جلسة ' : ''}{weekdays[new Date(`${data?.effectiveDate ?? query.date}T00:00:00Z`).getUTCDay()]}</AppText>
        <AppText accessibilityLabel="موعد التحضير" style={{ color: palette.primary, fontFamily: 'CairoBold', fontSize: 11 }}>{formatHijriDate(data?.effectiveDate ?? query.date)}</AppText></View>
      <DashboardButton label="خيارات التحضير" icon="settings" iconOnly outlined onPress={() => setOptionsOpen(true)} disabled={mutation.busy} />
      <DashboardButton label="تحديث التحضير" icon="refresh" iconOnly outlined disabled={mutation.busy || resource.loading} onPress={() => {
        if (mutation.uncertain || outdated) void reconcile(); else void resource.reload();
      }} />
    </View>
    <ManagementPanel>
      <ManagementToolbar>
        {api.canViewStaff() && <DashboardSelect label="الفئة" value={query.target === 'students' ? 'طلاب' : 'مشرفي المسارات والإدارة'}
          basis={160} controlWidth={width >= 640 ? 256 : undefined} disabled={blocked} onPress={() => setTargetChoice(true)} />}
        {query.target === 'students' && <DashboardSelect label="الحلقة" value={circles.find(circle => String(circle.id) === query.committeeId)?.name ?? 'جميع الحلقات'}
          basis={160} disabled={blocked} onPress={() => setChoice('circle')} />}
        {query.target === 'students' && <DashboardButton label="تحضير جماعي" icon={batchOpen ? 'checkSquare' : 'square'} iconOnly outlined selected={batchOpen}
          disabled={blocked} onPress={() => setBatchOpen(current => !current)} />}
      </ManagementToolbar>
      {batchOpen && query.target === 'students' && <ManagementToolbar><AppText>حالات محددة: {selectedRows.length}</AppText>
        <DashboardSelect label="الحالة الجماعية" value={attendanceStatusLabel(bulkStatus)} disabled={blocked} onPress={() => setChoice('bulkStatus')} />
        <ActionButton label="تحضير المحددين" disabled={blocked || !selectedRows.length} onPress={() => { setAction({ rows: selectedRows, status: bulkStatus }); mutation.reset(); }} />
      </ManagementToolbar>}
      {!resource.loading && !resource.error && <>
        {!visible.length && <ManagementEmpty>لا توجد بيانات للتحضير.</ManagementEmpty>}
        {visible.slice(0, limit).map(row => <ManagementRow key={row.key} title={row.name} subtitle={query.target === 'staff' ? row.jobTitle || 'مشرف المسار' : undefined}
          artwork={batchOpen && query.target === 'students' && data && api.canSet(data, row) ? <DashboardButton label={`${selected.includes(row.key) ? 'إلغاء تحديد' : 'تحديد'} ${row.name}`}
            icon={selected.includes(row.key) ? 'checkSquare' : 'square'} iconOnly selected={selected.includes(row.key)} disabled={blocked}
            onPress={() => setSelected(current => current.includes(row.key) ? current.filter(key => key !== row.key) : [...current, row.key])} /> : undefined}
          actions={row.status === 'no_session' ? <AppText style={{ maxWidth: width < 640 ? 118 : 220, fontSize: 14, color: palette.muted, fontFamily: 'CairoBold' }}>{attendanceStatusLabel(row.status)}</AppText>
            : <DashboardSelect label={`حالة حضور ${row.name}`} value={row.status === 'unrecorded' ? 'اختر الحالة' : attendanceStatusLabel(row.status)} controlWidth={128}
              disabled={blocked || !data || !api.canSet(data, row)} onPress={() => setRowChoice(row)} />} />)}
        {visible.length > limit && <View style={{ padding: 16 }}><ActionButton label="عرض المزيد" secondary onPress={() => setLimit(value => value + 50)} /></View>}
      </>}
    </ManagementPanel>
    <FormDialog visible={optionsOpen && !choice} title="خيارات التحضير" busy={mutation.busy} onClose={() => setOptionsOpen(false)}>
      <HijriDatePicker label="تاريخ التحضير" value={dateDraft} disabled={blocked} onChange={setDateDraft} />
      <ActionButton label="عرض التاريخ" secondary disabled={locked} onPress={() => changeQuery({ date: dateDraft, period: false })} />
      {data && <><AppText>موعد التحضير: {formatHijriDate(data.effectiveDate)}</AppText>
        {data.query.target === 'students' && data.effectiveDate !== data.query.date && <AppText>يعرض آخر يوم جلسة قبل التاريخ المختار.</AppText>}
        <AppText>أيام التحضير: {data.policy.recitationSessionDays.map(day => weekdays[day]).join('، ')}</AppText>
        <AppText>{query.target === 'staff' ? `تحضير الكادر: ${data.policy.staffAttendanceSource === 'teacher' ? 'من حساباتهم' : 'عن طريق المشرف'}`
          : `مسؤول تحضير الطلاب: ${data.policy.recitationAttendanceSource === 'teacher' ? 'مشرف المسار' : 'المشرف'}`}</AppText>
        {query.target === 'students' && !data.policy.attendanceManualEnabled && <AppText>التحضير اليدوي للطلاب معطل.</AppText>}
        {query.target === 'staff' && data.policy.staffAttendanceSource === 'teacher' && <AppText>يعرض السجل فقط. يحضّر الموظفون من حساباتهم.</AppText>}
      </>}
      {api.canEditPolicy() && <ActionButton label="سياسة التحضير" secondary loading={policyLoading} disabled={blocked} onPress={() => { setOptionsOpen(false); void openPolicy(); }} />}
    {query.target === 'staff' && <SectionCard title="تقرير الموظفين"><View style={screenStyles.grid}>
      <View style={screenStyles.field}><HijriDatePicker label="بداية الفترة" value={fromDraft} max={toDraft} disabled={blocked} onChange={setFromDraft} /></View>
      <View style={screenStyles.field}><HijriDatePicker label="نهاية الفترة" value={toDraft} min={fromDraft} disabled={blocked} onChange={setToDraft} /></View>
    </View><View style={screenStyles.actions}><ActionButton label="عرض الفترة" disabled={locked} onPress={() => changeQuery({ from: fromDraft, to: toDraft, period: true })} />
      <ActionButton label={people.find(person => person.value === query.staffId)?.label ?? 'كل الموظفين'} secondary disabled={blocked} onPress={() => setChoice('staff')} /></View>
      {data && <AppText>بداية التأخر بعد أذان العصر: {data.policy.staffAttendanceLateAfterAsrMinutes} دقيقة، بحسب توقيت بريدة.</AppText>}
    </SectionCard>}
      <FormField label="البحث في التحضير" value={search} onChangeText={value => { setSearch(value); setLimit(50); }} />
      <DashboardSelect label="تصفية حالات الحضور" value={statuses.find(status => status.value === statusFilter)?.label ?? 'كل الحالات'} onPress={() => setChoice('statusFilter')} />
      {query.target === 'staff' && data?.rows.map(row => <View key={row.key} style={{ gap: 4 }}><AppText style={screenStyles.bold}>{row.name}</AppText>
        {!!row.checkInTime && <AppText>وقت التحضير: {formatClockTime(row.checkInTime)}</AppText>}
        {!!row.checkInMethod && <AppText>طريقة التحضير: {row.checkInMethod === 'self' ? 'الحساب' : row.checkInMethod === 'manual' ? 'يدوي' : row.checkInMethod}</AppText>}
        {row.distance !== null && <AppText>المسافة: {row.distance} متر</AppText>}</View>)}
    </FormDialog>
    <ConfirmDialog visible={!!action} title="حفظ التحضير" message={action ? `موعد التحضير: ${formatHijriDate(action.rows[0]?.recordDate)}. الحالة: ${attendanceStatusLabel(action.status)}. حالات مختارة: ${action.rows.length}.` : ''}
      confirmLabel={mutation.uncertain || outdated ? 'تحديث البيانات للتحقق' : 'حفظ التحضير'} busy={mutation.busy}
      error={[mutation.error, batch ? `حُفظت حالات: ${batch.saved.length}. تعذّر حفظ حالات: ${batch.failed.length}. لم تُرسل حالات: ${batch.pending.length}.` : ''].filter(Boolean).join('\n')}
      onConfirm={() => { void saveAttendance(); }} onClose={() => { if (mutation.uncertain || outdated) void reconcile(); else setAction(null); }} />
    <FormDialog visible={!!policy} title="سياسة التحضير" busy={mutation.busy} onClose={() => { if (mutation.uncertain || outdated) void reconcile(); else closeAll(); }}
      footer={<ActionButton label={mutation.uncertain || outdated ? 'تحديث البيانات للتحقق' : 'حفظ السياسة'} loading={mutation.busy} onPress={() => {
        if (mutation.uncertain || outdated) { void reconcile(); return; }
        if (policy) void mutation.run(async () => {
          try { await api.savePolicy(policy, policyDraft); }
          catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause; }
        }, closeAll, () => 'حُفظت سياسة التحضير.');
      }} />}>
      <SectionCard title="تحضير الكادر عن طريق"><View style={screenStyles.actions}>
        <ActionButton label="المشرف" accessibilityLabel="تحضير الكادر: المشرف" secondary={policyDraft.staffAttendanceSource !== 'supervisor'} disabled={blocked} onPress={() => setPolicyDraft(current => ({ ...current, staffAttendanceSource: 'supervisor' }))} />
        <ActionButton label="حساباتهم" accessibilityLabel="تحضير الكادر: حساباتهم" secondary={policyDraft.staffAttendanceSource !== 'teacher'} disabled={blocked} onPress={() => setPolicyDraft(current => ({ ...current, staffAttendanceSource: 'teacher' }))} />
      </View></SectionCard>
      <SectionCard title="مسؤول تحضير الطلاب"><View style={screenStyles.actions}>
        <ActionButton label="المشرف" accessibilityLabel="تحضير الطلاب: المشرف" secondary={policyDraft.recitationAttendanceSource !== 'supervisor'} disabled={blocked} onPress={() => setPolicyDraft(current => ({ ...current, recitationAttendanceSource: 'supervisor' }))} />
        <ActionButton label="مشرف المسار" accessibilityLabel="تحضير الطلاب: مشرف المسار" secondary={policyDraft.recitationAttendanceSource !== 'teacher'} disabled={blocked} onPress={() => setPolicyDraft(current => ({ ...current, recitationAttendanceSource: 'teacher' }))} />
      </View></SectionCard>
      <FormField label="بداية التأخر بعد أذان العصر بالدقائق" value={policyDraft.lateMinutes} keyboardType="number-pad" editable={!blocked}
        hint="بحسب توقيت العصر في بريدة." onChangeText={value => setPolicyDraft(current => ({ ...current, lateMinutes: value }))} />
      {!!mutation.error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{mutation.error}</AppText>}
    </FormDialog>
    <ChoiceDialog visible={!!choice} title={choice === 'circle' ? 'اختر الحلقة' : choice === 'staff' ? 'اختر الموظف' : 'اختر الحالة'}
      options={options} value={choice === 'circle' ? query.committeeId : choice === 'staff' ? query.staffId : choice === 'statusFilter' ? statusFilter : bulkStatus}
      onChoose={value => { if (choice === 'circle') changeQuery({ committeeId: value }); else if (choice === 'staff') changeQuery({ staffId: value });
        else if (choice === 'statusFilter') { setStatusFilter(value); setLimit(50); } else setBulkStatus(value as StudentAttendanceStatus); }} onClose={() => setChoice(null)} />
    <ChoiceDialog visible={targetChoice} title="الفئة" value={query.target} options={[{ value: 'students', label: 'طلاب' }, ...(api.canViewStaff() ? [{ value: 'staff', label: 'مشرفي المسارات والإدارة' }] : [])]}
      onChoose={value => changeQuery({ target: value as AttendanceQuery['target'], ...(value === 'students' ? { period: false } : {}) })} onClose={() => setTargetChoice(false)} />
    <ChoiceDialog visible={!!rowChoice} title={rowChoice ? `حالة حضور ${rowChoice.name}` : 'حالة الحضور'} value={rowChoice?.status}
      options={attendanceStatusOptions} onChoose={value => { if (rowChoice && value !== rowChoice.status) { setAction({ rows: [rowChoice], status: value as StudentAttendanceStatus }); mutation.reset(); } }} onClose={() => setRowChoice(null)} />
  </ScreenLayout>;
}
