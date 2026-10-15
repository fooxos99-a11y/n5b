import { useCallback, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { PlanRangeFields } from '../components/plan/PlanRangeFields';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { emptyPlanRange, initialPlanDraft, normalizeNewPriorRange, normalizePlanDraft, planRangeDraft, planRangeLabel, previewManagedPlan,
  type ManagedPlanStudent, type PlanDraft, type PlanPause, type PlanRange, type PlanRangeDraft } from '../domain/planManagement';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { NativeApiError } from '../services/nativeApi';
import type { PlanManagementApi } from '../services/planManagementApi';
import { usePalette } from '../theme';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';

type PlanAction = { type: 'close'; row: ManagedPlanStudent } | { type: 'delete'; row: ManagedPlanStudent }
  | { type: 'pause'; state: PlanPause; row?: ManagedPlanStudent }
  | { type: 'prior'; row: ManagedPlanStudent; range: PlanRange }
  | { type: 'save'; row: ManagedPlanStudent; draft: PlanDraft };
export function PlanManagementScreen({ api, onBack }: { api: PlanManagementApi; onBack: () => void }) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const loader = useCallback((signal: AbortSignal) => api.load(signal), [api]); const resource = useLoadedResource(loader);
  const data = resource.value; const mutation = useVerifiedMutation(resource.reload);
  const [search, setSearch] = useState(''); const [committee, setCommittee] = useState('all'); const [choice, setChoice] = useState<'committee' | 'track' | 'mode' | null>(null);
  const [form, setForm] = useState<{ row: ManagedPlanStudent; draft: PlanDraft } | null>(null);
  const [priorEditor, setPriorEditor] = useState<PlanRangeDraft | null>(null); const [memorized, setMemorized] = useState<ManagedPlanStudent | null>(null);
  const [action, setAction] = useState<PlanAction | null>(null); const [validation, setValidation] = useState(''); const [outdated, setOutdated] = useState(false);
  const { busy, uncertain } = mutation; const blocked = busy || uncertain || outdated || resource.loading || !!resource.error;
  const needsRefresh = uncertain || outdated;
  const error = mutation.error || validation; const committees = [...new Set(data?.rows.map(row => row.committeeName).filter(Boolean) ?? [])];
  const rows: ManagedPlanStudent[] = filterRosterByName(data?.rows.map(row => ({ ...row, name: row.studentName })) ?? [], search)
    .filter((row: ManagedPlanStudent) => committee === 'all' || row.committeeName === committee);
  const change = (patch: Partial<PlanDraft>) => { if (!blocked) setForm(current => current ? { ...current, draft: { ...current.draft, ...patch } } : current); };
  function closeAll() { setForm(null); setAction(null); setPriorEditor(null); setMemorized(null); setOutdated(false); setValidation(''); mutation.reset(); }
  function close() { if (needsRefresh) void mutation.reconcile(closeAll); else closeAll(); }
  function open(row: ManagedPlanStudent, newPlan = false) {
    if (!blocked && data) { setForm({ row, draft: initialPlanDraft(row, data, newPlan) }); setValidation(''); mutation.reset(); }
  }
  function confirm(next: PlanAction) { if (!blocked) { setAction(next); setValidation(''); mutation.reset(); } }
  async function perform() {
    if (!action || !data) return;
    if (needsRefresh) { await mutation.reconcile(closeAll); return; }
    await mutation.run(async () => {
      try {
        if (action.type === 'save') return await api.savePlan(action.row, action.draft, data);
        if (action.type === 'close') return await api.closePlan(action.row);
        if (action.type === 'delete') return await api.deletePlan(action.row);
        if (action.type === 'prior') return await api.deletePrior(action.row, action.range.startPage, action.range.endPage);
        return await api.setPause(action.state, action.row?.studentId);
      } catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); throw cause; }
    }, closeAll, () => action.type === 'save' ? 'حُفظت خطة الطالب.' : action.type === 'close' ? 'أُغلقت الحالية وتبدأ الخطة التالية غدًا.'
      : action.type === 'delete' ? 'حُذفت الخطة الحالية. بقي المحفوظ والنتائج السابقة.' : action.type === 'prior' ? 'حُذف مقدار المحفوظ.'
        : action.state.paused ? 'استؤنفت الخطة من تقدمها السابق.' : 'أُوقفت الخطة.');
  }
  function validateSave() {
    if (!form || !data || blocked) return;
    try { normalizePlanDraft(form.draft, form.row, data); confirm({ type: 'save', ...form }); }
    catch (cause) { setValidation(cause instanceof Error ? cause.message : 'راجع بيانات الخطة.'); }
  }
  let preview: ReturnType<typeof previewManagedPlan> | null = null;
  if (form && data) { try { preview = previewManagedPlan(form.draft, data, form.row); } catch { preview = null; } }
  const rangeText = (range: PlanRange) => data ? planRangeLabel(range, data.chapters, data.settings.referenceMode) : '';
  const actionTitle = !action ? '' : action.type === 'save' ? 'حفظ خطة الطالب' : action.type === 'close' ? 'إغلاق الخطة الحالية'
    : action.type === 'delete' ? 'حذف الخطة الحالية' : action.type === 'prior' ? 'حذف المحفوظ'
      : action.state.paused ? (action.row ? 'استئناف خطة الطالب' : 'تشغيل الخطط') : (action.row ? 'إيقاف خطة الطالب' : 'إيقاف الخطط');
  const actionMessage = !action ? '' : action.type === 'save' ? (action.draft.mode === 'new'
    ? 'تُحفظ الخطة الحالية في السجل وتبدأ خطة جديدة بهذه البيانات.' : 'تستمر الخطة الحالية مع حفظ التقدم. تتغير المقادير أو النطاق حسب سياسة الخادم.')
    : action.type === 'close' ? `ستُحفظ الحالية في السجل وتبدأ الخطة التالية غدًا لـ${action.row.studentName}.`
      : action.type === 'delete' ? `ستُحذف الحالية لـ${action.row.studentName}. تبقى نتائج التسميع والمحـفوظ، وتُزال المهام التي لم تُنفّذ فقط.`
        : action.type === 'prior' ? `سيُحذف المحفوظ ${rangeText(action.range)} لـ${action.row.studentName}.`
          : action.row ? (action.state.paused ? 'تستأنف خطة الطالب من تقدمها السابق عند عدم وجود إيقاف عام.'
            : 'تتوقف خطة الطالب من اليوم، ولا يُحتسب تعثر جديد خلال الإيقاف. يبقى الاجتياز متاحًا.')
            : action.state.paused ? 'تستأنف الخطط من تقدمها السابق، وتبقى الخطط الموقوفة لطالب محدد متوقفة.'
              : 'تتوقف جميع خطط الطلاب من اليوم. لا يُحتسب إنجاز أو تعثر جديد خلال الإيقاف، ويتغير تاريخ الانتهاء المتوقع.';
  return <ScreenLayout title="خطط الطلاب" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {data && <>
      <ManagementPanel><ManagementToolbar><View style={{ flex: 1, flexBasis: 160, maxWidth: width >= 640 ? 384 : undefined }}>
        <FormField hideLabel compact label="ابحث باسم الطالب" placeholder="ابحث بالاسم" value={search} onChangeText={setSearch} /></View>
        <DashboardSelect basis={160} label="الحلقة" value={committee === 'all' ? 'كل الحلقات' : committee} disabled={blocked} onPress={() => setChoice('committee')} />
          {needsRefresh && <ActionButton label="تحديث الخطط" secondary disabled={busy || resource.loading} onPress={() => {
            if (needsRefresh) void mutation.reconcile(closeAll); else void resource.reload();
          }} />}
          {data.pause.canManage && <ActionButton label={data.pause.paused ? 'تشغيل الخطط' : 'إيقاف الخطط'} disabled={blocked} secondary
            onPress={() => confirm({ type: 'pause', state: data.pause })} />}
      </ManagementToolbar>
      {data.pause.paused && <AppText style={{ padding: 16, color: palette.muted }}>الخطط متوقفة منذ {formatHijriDate(data.pause.pausedFrom)}</AppText>}
      {!resource.loading && !resource.error && (rows.length ? rows.map(row => <View key={row.studentId} style={{ flexDirection: 'row-reverse', flexWrap: 'wrap',
        alignItems: 'center', gap: 12, paddingHorizontal: width < 640 ? 16 : 24, paddingVertical: 12, borderBottomWidth: 1, borderColor: palette.border }}>
        <View style={{ flex: width < 640 ? 1 : undefined, width: width < 640 ? undefined : 256, minWidth: 0 }}>
          <AppText style={[screenStyles.bold, { fontSize: 16 }]}>{row.studentName}</AppText>
          <AppText style={{ color: palette.muted, fontSize: 14 }}>{row.committeeName || 'بدون حلقة'}</AppText>
        </View>
        {row.plan && <View style={{ flexGrow: 1, flexBasis: width < 640 ? '100%' : 160, minWidth: 0, gap: 4 }}>
          <AppText style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{row.plan.track === 'mastery' ? 'إتقان' : 'حفظ'}</AppText>
          {!!row.plan.projectedEndDate && <AppText style={{ fontSize: width < 640 ? 12 : 14, lineHeight: 24 }}>
            تاريخ انتهاء الخطة المتوقع: {formatHijriDate(row.plan.projectedEndDate)}</AppText>}
          <AppText style={{ color: palette.muted, fontFamily: 'CairoBold', fontSize: 12, lineHeight: 18 }}>نسبة الإنجاز {row.plan.progressPercent}٪</AppText>
          <View accessibilityRole="progressbar" accessibilityLabel={`إنجاز خطة ${row.studentName}`} accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, row.plan.progressPercent)) }}
            style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row-reverse', backgroundColor: palette.mutedSurface }}>
            <View style={{ width: `${Math.max(0, Math.min(100, row.plan.progressPercent))}%`, height: '100%', borderRadius: 4, backgroundColor: palette.primary }} />
          </View>
        </View>}
        <View style={[screenStyles.actions, { gap: 4 }]}>
          {!row.plan && <ActionButton icon="plus" label="إضافة خطة" accessibilityLabel={`إضافة خطة ${row.studentName}`} secondary disabled={blocked} onPress={() => open(row)} />}
          {row.plan && <><ActionButton label={row.planPause.paused ? 'استئناف' : 'إيقاف'} accessibilityLabel={`${row.planPause.paused ? 'استئناف خطة' : 'إيقاف خطة'} ${row.studentName}`} secondary disabled={blocked || !row.planPause.canManage}
            onPress={() => confirm({ type: 'pause', state: row.planPause, row })} />
            {!!row.plan.queuedRanges.length && <ActionButton label="إغلاق الحالية" accessibilityLabel={`إغلاق الحالية ${row.studentName}`} secondary disabled={blocked} onPress={() => confirm({ type: 'close', row })} />}
            {row.plan.progressPercent >= 100 && <ManagementIconButton icon="plus" label={`خطة جديدة ${row.studentName}`} disabled={blocked} onPress={() => open(row, true)} />}
            <ManagementIconButton icon="edit" label={`تعديل خطة ${row.studentName}`} disabled={blocked} onPress={() => open(row)} />
            <ManagementIconButton icon="delete" label={`حذف خطة ${row.studentName}`} disabled={blocked} onPress={() => confirm({ type: 'delete', row })} /></>}
          {!!row.priorMemorization.length && <ActionButton label="المحفوظ المجتاز" accessibilityLabel={`المحفوظ المجتاز ${row.studentName}`} secondary disabled={blocked} onPress={() => { mutation.reset(); setMemorized(row); }} />}
        </View>
      </View>) : <ManagementEmpty>لا يوجد طلاب مطابقون.</ManagementEmpty>)}
      </ManagementPanel>
      <FormDialog visible={!!form && !action && !priorEditor} title={`${form?.row.plan ? 'تعديل الخطة' : 'إضافة خطة'} — ${form?.row.studentName ?? ''}`}
        busy={busy} onClose={close} footer={needsRefresh ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(closeAll); }} />
          : <ActionButton label="حفظ الخطة" loading={busy} disabled={blocked} onPress={validateSave} />}>
        {form && <>
          <View style={screenStyles.actions}><ActionButton label={`المسار: ${form.draft.track === 'mastery' ? 'إتقان' : 'حفظ'}`} secondary disabled={blocked} onPress={() => setChoice('track')} />
            {form.row.plan && <ActionButton label={form.draft.mode === 'continue' ? 'متابعة الخطة الحالية' : 'حفظ الحالية وبدء خطة جديدة'} secondary disabled={blocked} onPress={() => setChoice('mode')} />}</View>
          <FormField label="بداية الخطة" value={form.draft.startDate} hint={`سنة-شهر-يوم • ${formatHijriDate(form.draft.startDate) || 'اختر تاريخًا صحيحًا'}`}
            editable={!blocked && !(form.draft.mode === 'continue' && !!form.row.plan?.startDate && form.row.plan.startDate < data.settings.minimumStartDate)}
            maxLength={10} onChangeText={startDate => change({ startDate })} />
          <PlanRangeFields label="الخطة" value={form.draft.range} onChange={range => change({ range })} data={data} api={api} disabled={blocked} />
          <View style={screenStyles.grid}>{([
            ['dailyPages', 'الحفظ اليومي بالأوجه'], ['linkPages', 'الربط بالأوجه'], ['reviewHizbs', 'المراجعة اليومية بالأحزاب'], ['readingHizbs', 'القراءة اليومية بالأحزاب'],
          ] as const).map(([field, label]) => <View key={field} style={screenStyles.field}><FormField label={label} value={form.draft[field]}
            editable={!blocked} keyboardType="decimal-pad" maxLength={8} onChangeText={value => change({ [field]: value })} /></View>)}</View>
          <SectionCard title="المحفوظ السابق">{form.row.priorMemorization.length ? form.row.priorMemorization.map((range, index) => <AppText key={index}>{rangeText(range)}</AppText>) : <AppText>لا يوجد محفوظ سابق.</AppText>}
            {form.draft.priorMemorization.map((range, index) => <View key={index} style={screenStyles.row}><PlanRangeFields label={`المحفوظ ${index + 1}`} value={range}
              onChange={value => change({ priorMemorization: form.draft.priorMemorization.map((item, position) => position === index ? value : item) })} data={data} api={api} disabled={blocked} />
              <ActionButton label={`إزالة المحفوظ المضاف ${index + 1}`} secondary disabled={blocked} onPress={() => change({ priorMemorization: form.draft.priorMemorization.filter((_, position) => position !== index) })} /></View>)}
            <ActionButton label="إضافة محفوظ سابق" secondary disabled={blocked} onPress={() => { setValidation(''); setPriorEditor(emptyPlanRange()); }} />
          </SectionCard>
          <SectionCard title="الخطط التالية">{form.draft.queuedRanges.map((range, index) => <View key={index} style={screenStyles.row}>
            <PlanRangeFields label={`الخطة التالية ${index + 1}`} value={range}
              onChange={value => change({ queuedRanges: form.draft.queuedRanges.map((item, position) => position === index ? value : item) })} data={data} api={api} disabled={blocked} />
            <ActionButton label={`إزالة الخطة التالية ${index + 1}`} secondary disabled={blocked} onPress={() => change({ queuedRanges: form.draft.queuedRanges.filter((_, position) => position !== index) })} />
          </View>)}<ActionButton label="إضافة خطة تالية" secondary disabled={blocked} onPress={() => change({ queuedRanges: [...form.draft.queuedRanges, emptyPlanRange()] })} /></SectionCard>
          <SectionCard title="معاينة الخطة">{preview ? <><AppText>المتبقي للحفظ {preview.pages} وجه • أيام التنفيذ المتوقعة: {preview.days}</AppText>
            {preview.error ? <AppText accessibilityRole="alert" style={{ color: palette.error }}>{preview.error}</AppText>
              : <AppText>الانتهاء المتوقع: {formatHijriDate(preview.endDate) || '—'}</AppText>}</> : <AppText>اختر بداية ونهاية صحيحتين لعرض المعاينة.</AppText>}</SectionCard>
        </>}{!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
      </FormDialog>
      <FormDialog visible={!!priorEditor} title="إضافة محفوظ سابق" onClose={() => { setPriorEditor(null); setValidation(''); }} footer={<ActionButton label="إضافة المحفوظ" onPress={() => {
        if (!form || !priorEditor) return;
        try { const range = normalizeNewPriorRange(priorEditor, data, form.row, form.draft.priorMemorization);
          change({ priorMemorization: [...form.draft.priorMemorization, planRangeDraft(range)] }); setPriorEditor(null); setValidation(''); }
        catch { setValidation('اختر مقدارًا صحيحًا غير مضاف أو مجتاز سابقًا.'); }
      }} />}>
        {priorEditor && <PlanRangeFields label="المحفوظ" value={priorEditor} onChange={setPriorEditor} data={data} api={api} />}
        {!!validation && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{validation}</AppText>}
      </FormDialog>
      <FormDialog visible={!!memorized && !action} title={`المحفوظ المجتاز — ${memorized?.studentName ?? ''}`} onClose={close}>
        {memorized?.priorMemorization.map((range, index) => <View key={index} style={[screenStyles.row, { borderColor: palette.border }]}>
          <AppText>{rangeText(range)}</AppText><ActionButton label={`حذف المحفوظ ${rangeText(range)}`} secondary disabled={blocked} onPress={() => confirm({ type: 'prior', row: memorized, range })} />
        </View>)}
      </FormDialog>
      <ConfirmDialog visible={!!action} title={actionTitle} message={actionMessage} error={error} busy={busy}
        confirmLabel={needsRefresh ? 'تحديث البيانات للتحقق' : actionTitle} onClose={() => { if (needsRefresh) close(); else { setAction(null); mutation.reset(); } }} onConfirm={() => { void perform(); }} />
      <ChoiceDialog visible={!!choice} title={choice === 'committee' ? 'اختر الحلقة' : choice === 'track' ? 'مسار الخطة' : 'طريقة حفظ الخطة'}
        options={choice === 'committee' ? [{ value: 'all', label: 'كل الحلقات' }, ...committees.map(name => ({ value: name, label: name }))]
          : choice === 'track' ? [{ value: 'memorization', label: 'حفظ' }, { value: 'mastery', label: 'إتقان' }]
            : [{ value: 'continue', label: 'متابعة الخطة الحالية' }, { value: 'new', label: 'حفظ الحالية وبدء خطة جديدة' }]}
        value={choice === 'committee' ? committee : choice === 'track' ? form?.draft.track : form?.draft.mode}
        onChoose={value => { if (choice === 'committee') setCommittee(value); else if (choice === 'track') change({ track: value as PlanDraft['track'] });
          else if (form) change({ mode: value as PlanDraft['mode'], startDate: value === 'new' ? data.settings.minimumStartDate : form.row.plan?.startDate ?? form.draft.startDate }); }}
        onClose={() => setChoice(null)} />
    </>}
  </ScreenLayout>;
}
