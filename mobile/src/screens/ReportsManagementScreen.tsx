import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, useWindowDimensions } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { ReportMetricCard, ReportMetricDialog } from '../components/reports/ReportMetricPanel';
import { ReportPerformanceChart } from '../components/reports/ReportPerformanceChart';
import { ReportRankingPanels, ReportTeachersPanel } from '../components/reports/ReportRankingPanels';
import { ReportDetailTable } from '../components/reports/ReportTables';
import { buildNativeReportMetrics, rolledReportQuery } from '../components/reports/reportPresentation';
import { createReportReadState } from '../components/reports/reportReadState';
import { DEFAULT_REPORT_PERIOD, REPORT_PERIOD_LABELS, reportPeriodRange, type ReportArchive,
  type ReportManagementData, type ReportManagementQuery, type ReportPeriodKey } from '../domain/reportManagement';
import type { ReportManagementApi } from '../services/reportManagementApi';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { NativeApiError } from '../services/nativeApi';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { getSaudiCalendarDate } from '../../../shared/business-date.js';

const reportTypes = { overview: 'الإحصائيات', students: 'تحضير الطلاب', supervisors: 'تحضير الموظفين', progress: 'تقدم الطلاب', recitations: 'جلسات التسميع', saved: 'المحفوظ',
  studentPoints: 'أرصدة نقاط الطلاب', weekly: 'درجات الجلسة الأسبوعية', track: 'درجات جلسة المسار' } as const;
type VisibleReportType = keyof typeof reportTypes;
export function sameReportQuery(first: ReportManagementQuery, second: ReportManagementQuery) {
  return first.from === second.from && first.to === second.to && first.committeeId === second.committeeId
    && first.complexId === second.complexId && first.archiveId === second.archiveId && (first.reportType ?? 'overview') === (second.reportType ?? 'overview');
}
export function ReportsManagementScreen({ api, onBack }: { api: ReportManagementApi; onBack: () => void }) {
  const { width: viewportWidth } = useWindowDimensions(); const [metricsWidth, setMetricsWidth] = useState(0);
  const metricColumns = viewportWidth >= 768 ? 3 : 2;
  const [period, setPeriod] = useState<ReportPeriodKey>(DEFAULT_REPORT_PERIOD);
  const [custom, setCustom] = useState(() => ({ from: getSaudiCalendarDate(), to: getSaudiCalendarDate() }));
  const [query, setQuery] = useState<ReportManagementQuery>(() => ({ ...reportPeriodRange(DEFAULT_REPORT_PERIOD), committeeId: 'all', complexId: 'all' }));
  const queryRef = useRef(query); const writeRef = useRef(false); const lastLoad = useRef<ReportManagementData | null>(null);
  const loadedApi = useRef<ReportManagementApi | null>(null);
  const [readState] = useState(createReportReadState); const references = readState.bind(api);
  const loader = useCallback(async (signal: AbortSignal) => {
    const requested = sameReportQuery(query, queryRef.current) ? query : queryRef.current;
    try {
      const result = await api.load(requested, signal);
      if (!signal.aborted && sameReportQuery(requested, queryRef.current) && readState.accepted(api, result)) { lastLoad.current = result; loadedApi.current = api; }
      return result;
    } catch (cause) {
      if (!signal.aborted && sameReportQuery(requested, queryRef.current) && readState.failed(api, cause)) {
        lastLoad.current = null; loadedApi.current = null; setDeletion(null); setChoice(null); setSelectedMetric(null);
      }
      throw cause;
    }
  }, [api, query, readState]);
  const resource = useLoadedResource<ReportManagementData>(loader); const data = loadedApi.current === api && resource.value && resource.value.queryKey === api.queryKey(query) && sameReportQuery(resource.value.query, query) ? resource.value : null;
  const [choice, setChoice] = useState<'period' | 'complex' | 'circle' | 'type' | null>(null); const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(custom); const [localError, setLocalError] = useState(''); const [stale, setStale] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null); const [detailCircle, setDetailCircle] = useState('all');
  const [deletion, setDeletion] = useState<ReportArchive | null>(null);
  const deletionOwner = useRef<ReportManagementApi | null>(null);
  const changeQuery = useCallback((next: ReportManagementQuery) => {
    queryRef.current = next; setQuery(next); setSelectedMetric(null); setDetailCircle('all'); setLocalError('');
  }, []);
  const reloadResource = resource.reload;
  const reload = useCallback(async () => {
    const loaded = await reloadResource(); if (!loaded) return false;
    if (lastLoad.current?.reconciledArchiveDeletion && queryRef.current.archiveId === lastLoad.current.reconciledArchiveDeletion) {
      changeQuery({ ...queryRef.current, archiveId: undefined }); return true;
    }
    return true;
  }, [reloadResource, changeQuery]);
  const mutation = useVerifiedMutation(reload); const pending = mutation.uncertain || stale || api.hasUncertainOperation();
  const loading = resource.loading || (!data && !resource.error && !mutation.error);
  const controlsBlocked = loading || mutation.busy || pending;
  const blocked = controlsBlocked || !!resource.error || !data;
  const latestBlocked = useRef(blocked); latestBlocked.current = blocked;
  useEffect(() => {
    if (query.archiveId) return;
    const refresh = () => {
      if (latestBlocked.current || writeRef.current) return;
      const next = rolledReportQuery(queryRef.current, period, getSaudiCalendarDate());
      if (next !== queryRef.current) changeQuery(next);
      else void reload();
    };
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 60_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [query.archiveId, reload, period, changeQuery]);
  function closeDelete() { setDeletion(null); deletionOwner.current = null; setStale(false); mutation.reset(); }
  function refresh() {
    if (writeRef.current || mutation.busy) return;
    if (pending) void mutation.reconcile(closeDelete); else {
      setSelectedMetric(null); const next = rolledReportQuery(queryRef.current, period, getSaudiCalendarDate());
      if (next !== queryRef.current) changeQuery(next); else void reload();
    }
  }
  function choosePeriod(value: string) {
    if (controlsBlocked || writeRef.current) return;
    if (value === 'custom') { setCustomDraft(custom); setLocalError(''); setCustomOpen(true); return; }
    if (value.startsWith('archive:')) {
      const id = Number(value.slice(8)); if (!references?.grants.canManageArchives || !references.archives.some(row => row.id === id)) return;
      changeQuery({ ...query, archiveId: id, committeeId: 'all', complexId: 'all', reportType: 'overview' }); return;
    }
    if (!Object.hasOwn(REPORT_PERIOD_LABELS, value)) return;
    const nextPeriod = value as ReportPeriodKey; setPeriod(nextPeriod);
    changeQuery({ ...query, ...reportPeriodRange(nextPeriod, custom), archiveId: undefined });
  }
  function applyCustom() {
    if (controlsBlocked || writeRef.current) return;
    try { const range = reportPeriodRange('custom', customDraft); setPeriod('custom'); setCustom(range); setCustomDraft(range);
      changeQuery({ ...query, ...range, archiveId: undefined }); setCustomOpen(false); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'الفترة غير صحيحة.'); }
  }
  async function removeArchive() {
    if (blocked || writeRef.current || !deletion || deletionOwner.current !== api || !data?.grants.canManageArchives || data.archive?.id !== deletion.id || query.archiveId !== deletion.id) return;
    writeRef.current = true;
    try {
      await mutation.run(async () => {
        try { const result = await api.deleteArchive({ id: deletion.id, expectedArchive: deletion }); changeQuery({ ...queryRef.current, archiveId: undefined }); return result; }
        catch (cause) {
          if (readState.failed(api, cause)) { lastLoad.current = null; loadedApi.current = null; setDeletion(null); setChoice(null); setSelectedMetric(null); }
          if (cause instanceof NativeApiError && cause.code === 'conflict') setStale(true); throw cause;
        }
      }, closeDelete, () => 'تم حذف الأرشيف بعد التحقق من أثر العملية.');
    } finally { writeRef.current = false; }
  }
  const overview = data?.overview ?? null; const archive = data?.archive;
  const metrics = buildNativeReportMetrics(overview, { showStandard: data?.grants.canViewStandardReports ?? false,
    showTeacherPoints: !query.archiveId && (data?.grants.canViewTeacherPoints ?? false), teacherPoints: data?.teacherPoints,
    weeklySession: data?.grants.weeklySession ?? false, trackSession: data?.grants.trackSession ?? false, legacy: !!query.archiveId });
  const details = buildNativeReportMetrics(overview, { showStandard: data?.grants.canViewStandardReports ?? false,
    showTeacherPoints: !query.archiveId && (data?.grants.canViewTeacherPoints ?? false), teacherPoints: data?.teacherPoints, committee: detailCircle,
    weeklySession: data?.grants.weeklySession ?? false, trackSession: data?.grants.trackSession ?? false, legacy: !!query.archiveId }).find(metric => metric.id === selectedMetric);
  const detailCommittees = [...new Set((overview?.committeeIndicators ?? []).map(row => row.name).filter(Boolean))];
  const periodLabel = query.archiveId ? references?.archives.find(row => row.id === query.archiveId)?.title ?? 'أرشيف التقارير'
    : period === 'custom' ? `من ${query.from} إلى ${query.to}` : REPORT_PERIOD_LABELS[period];
  const canShow = !!data && !loading && !resource.error;
  return <ScreenLayout title="الإحصائيات والتقارير" contentGap={24} onBack={() => { if (!writeRef.current && !mutation.busy) onBack(); }} loading={loading} error={resource.error} onRetry={refresh}>
    <View style={[screenStyles.actions, { gap: viewportWidth >= 640 ? 12 : 8 }]}>
      <DashboardSelect value={periodLabel} label="فترة التقارير" disabled={controlsBlocked} onPress={() => setChoice('period')} />
      {!query.archiveId && !!references && !references.grants.teacherScoped && !!references.complexes.length && <DashboardSelect value={query.complexId === 'all' ? 'كل المجمعات' : references.complexes.find(row => row.id === query.complexId)?.name ?? 'المجمع'} label="مجمع التقارير" disabled={controlsBlocked} onPress={() => setChoice('complex')} />}
      {!query.archiveId && !!references?.committees.length && <DashboardSelect value={query.committeeId === 'all' ? 'كل الحلقات' : references.committees.find(row => row.id === query.committeeId)?.name ?? 'الحلقة'} label="حلقة التقارير" disabled={controlsBlocked} onPress={() => setChoice('circle')} />}
      {!query.archiveId && query.reportType && query.reportType !== 'overview' && <ActionButton label="نوع التقرير" secondary disabled={controlsBlocked || !references} onPress={() => setChoice('type')} />}
      {pending && <ActionButton label="تحديث التقارير" secondary loading={mutation.busy} disabled={resource.loading || writeRef.current} onPress={refresh} />}
    </View>{period === 'custom' && !query.archiveId && <ActionButton label={`تعديل الفترة: ${query.from} — ${query.to}`} secondary disabled={controlsBlocked} onPress={() => { setCustomDraft(custom); setLocalError(''); setCustomOpen(true); }} />}
      {!!mutation.error && <AppText accessibilityRole="alert">{mutation.error}</AppText>}{!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
      {pending && <AppText accessibilityRole="alert">توقفت العمليات حتى نتحقق من نتيجة الحذف. لن يُعاد طلب الحذف عند التحديث.</AppText>}
    {canShow && <>
      {!!archive && <SectionCard title={archive.title}><AppText>من {archive.periodFrom} إلى {archive.periodTo}</AppText><AppText>تاريخ الحفظ: {archive.createdAt}</AppText>
        {data.grants.canManageArchives && <ActionButton label="حذف أرشيف التقرير" secondary disabled={blocked} onPress={() => { mutation.reset(); deletionOwner.current = api; setDeletion(archive); }} />}
        {!overview && <AppText>مؤشرات الإحصائيات غير متاحة في هذا الأرشيف. يعرض التقرير المحفوظ الموجود فقط.</AppText>}
      </SectionCard>}
      {!!overview?.planPerformance && <ReportPerformanceChart key={`chart:${data.queryKey}`} series={overview.planPerformance.series} />}
      <View style={[screenStyles.grid, { gap: 16 }]} onLayout={event => setMetricsWidth(event.nativeEvent.layout.width)}>
        {metrics.filter(metric => !(data.grants.teacherScoped && metric.id === 'committees' && (metric.countValue ?? Infinity) <= 1)).map(metric =>
          <View key={metric.id} style={{ width: metricsWidth > 0 ? (metricsWidth - 16 * (metricColumns - 1)) / metricColumns : '100%', minWidth: 0 }}>
            <ReportMetricCard metric={metric} disabled={blocked} onSelect={() => { setDetailCircle('all'); setSelectedMetric(metric.id); }} />
          </View>)}
      </View>
      {!!overview && <ReportRankingPanels bestStudents={overview.bestStudents} bestCommittees={overview.bestCommittees} bestComplexes={overview.bestComplexes} />}
      {!!overview?.teachers && !data.grants.teacherScoped && <ReportTeachersPanel key={`teachers:${data.queryKey}`} teachers={overview.teachers} />}
      {!!archive && <ReportDetailTable report={archive.progressReport} title="تفاصيل التقرير المحفوظ" />}
      {!query.archiveId && !!data.detail && <ReportDetailTable report={data.detail} title={reportTypes[(query.reportType ?? 'overview') as VisibleReportType] ?? 'التقرير'} />}
    </>}
    {!!canShow && !!details && <ReportMetricDialog key={`${data.queryKey}:${details.id}:${detailCircle}`} metric={details} periodLabel={periodLabel} committees={detailCommittees}
      committee={detailCircle} onCommitteeChange={setDetailCircle} onClose={() => setSelectedMetric(null)} onRetry={refresh}
      onReportType={!query.archiveId && data?.grants.canViewStandardReports ? () => setChoice('type') : undefined} />}
    <ChoiceDialog visible={choice === 'period'} title="فترة التقارير" value={query.archiveId ? `archive:${query.archiveId}` : period}
      options={[...Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => ({ value, label })), ...(references?.grants.canManageArchives ? references.archives.map(row => ({ value: `archive:${row.id}`, label: row.title })) : [])]}
      onChoose={choosePeriod} onClose={() => setChoice(null)} />
    <ChoiceDialog visible={choice === 'type'} title="نوع التقرير" value={query.reportType ?? 'overview'} options={Object.entries(reportTypes).filter(([key]) =>
      !!references && (key !== 'supervisors' || !references.grants.teacherScoped) && (key !== 'weekly' || references.grants.weeklySession) && (key !== 'track' || references.grants.trackSession)).map(([value, label]) => ({ value, label }))}
      onChoose={value => { if (!controlsBlocked && !writeRef.current && references && Object.hasOwn(reportTypes, value)) changeQuery({ ...query, reportType: value as VisibleReportType }); }} onClose={() => setChoice(null)} />
    <ChoiceDialog visible={choice === 'complex'} title="مجمع التقارير" value={String(query.complexId)} options={references ? [{ value: 'all', label: 'كل المجمعات' }, ...references.complexes.map(row => ({ value: String(row.id), label: row.name }))] : []}
      onChoose={value => { if (!controlsBlocked && !writeRef.current && references) changeQuery({ ...query, complexId: value === 'all' ? 'all' : Number(value), committeeId: 'all' }); }} onClose={() => setChoice(null)} />
    <ChoiceDialog visible={choice === 'circle'} title="حلقة التقارير" value={String(query.committeeId)} options={references ? [{ value: 'all', label: 'كل الحلقات' }, ...references.committees.filter(row => query.complexId === 'all' || row.complexId === query.complexId).map(row => ({ value: String(row.id), label: row.name }))] : []}
      onChoose={value => { if (!controlsBlocked && !writeRef.current && references) changeQuery({ ...query, committeeId: value === 'all' ? 'all' : Number(value) }); }} onClose={() => setChoice(null)} />
    <FormDialog visible={customOpen} title="فترة مخصصة" busy={mutation.busy} onClose={() => setCustomOpen(false)} footer={<ActionButton label="تطبيق فترة التقارير" disabled={controlsBlocked} onPress={applyCustom} />}>
      <FormField label="من تاريخ التقرير" hint="سنة-شهر-يوم" value={customDraft.from} maxLength={10} editable={!controlsBlocked} onChangeText={value => setCustomDraft(current => ({ ...current, from: value }))} />
      <FormField label="إلى تاريخ التقرير" hint="سنة-شهر-يوم" value={customDraft.to} maxLength={10} editable={!controlsBlocked} onChangeText={value => setCustomDraft(current => ({ ...current, to: value }))} />
      {!!localError && <AppText accessibilityRole="alert">{localError}</AppText>}
    </FormDialog>
    {!!deletion && deletionOwner.current === api && <FormDialog visible title="حذف أرشيف التقرير" busy={mutation.busy} onClose={() => { if (pending) void mutation.reconcile(closeDelete); else closeDelete(); }}
      footer={<><ActionButton label={pending ? 'تحديث البيانات للتحقق من الحذف' : 'تأكيد حذف أرشيف التقرير'} loading={mutation.busy} disabled={!pending && blocked} onPress={() => { if (pending) refresh(); else void removeArchive(); }} />
        <ActionButton label="إلغاء" secondary disabled={mutation.busy} onPress={() => { if (pending) refresh(); else closeDelete(); }} /></>}>
      <AppText>سيُحذف أرشيف «{deletion.title}» للفترة {deletion.periodFrom} إلى {deletion.periodTo}. لا يمكن التراجع عن حذف التقرير المحفوظ.</AppText>
      {!!mutation.error && <AppText accessibilityRole="alert">{mutation.error}</AppText>}
    </FormDialog>}
  </ScreenLayout>;
}
