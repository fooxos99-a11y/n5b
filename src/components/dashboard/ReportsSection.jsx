import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import ErrorState from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import MetricCard from '@/components/dashboard/reports/MetricCard';
import MetricDetails from '@/components/dashboard/reports/MetricDetails';
import { RankingPanels, TeachersPanel } from '@/components/dashboard/reports/RankingPanels';
import { ALL_COMMITTEES, buildReportMetrics, detailCommitteesOf } from '@/components/dashboard/reports/reportMetrics';
import { DEFAULT_REPORT_PERIOD, REPORT_PERIOD_LABELS, reportRange } from '@/lib/reportPeriods';
import { studentsApi } from '@/services/studentsApi';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { getBusinessDate } from '../../../shared/business-date.js';

const ARCHIVE_PREFIX = 'archive:';
const controlClassName = 'h-11 min-w-0 flex-1 basis-36 text-sm sm:w-56 sm:flex-none [&_span]:truncate';

/**
 * Statistics: one overview of indicators for a period, each opening its details,
 * followed by the best students and circles and, for management, every teacher's indicators.
 */
const ReportsSection = ({
  teacherScoped = false,
  canViewStandardReports = true,
  canViewTeacherPoints = false,
}) => {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const [period, setPeriod] = useState(DEFAULT_REPORT_PERIOD);
  const [custom, setCustom] = useState(() => ({ from: getBusinessDate(), to: getBusinessDate() }));
  const [draft, setDraft] = useState(custom);
  const [customOpen, setCustomOpen] = useState(false);
  const [committeeId, setCommitteeId] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [archives, setArchives] = useState([]);
  const [overview, setOverview] = useState(null);
  const [archive, setArchive] = useState(null);
  const [lists, setLists] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detailCommittee, setDetailCommittee] = useState(ALL_COMMITTEES);
  const [isDeletingArchive, setIsDeletingArchive] = useState(false);

  const archiveId = period.startsWith(ARCHIVE_PREFIX) ? period.slice(ARCHIVE_PREFIX.length) : '';
  const range = useMemo(() => (archiveId ? null : reportRange(period, custom)), [archiveId, period, custom]);
  const from = range?.from || '';
  const to = range?.to || '';
  const scopeCommittee = archiveId ? 'all' : committeeId;

  const cachedReport = useCallback((key, loader) => loadOfflineSnapshot(accountId, `reports:${key}`, loader, { actorRole }), [accountId, actorRole]);

  useEffect(() => {
    let active = true;
    Promise.all([
      canViewStandardReports && !teacherScoped ? cachedReport('scoped-committees', () => studentsApi.getReportCommittees()) : Promise.resolve([]),
      canViewStandardReports && !teacherScoped ? cachedReport('archives', () => studentsApi.getReportArchives()).catch(() => []) : Promise.resolve([]),
    ]).then(([committeeRows, archiveRows]) => {
      if (!active) return;
      setCommittees(committeeRows || []);
      setArchives(archiveRows || []);
    }).catch((error) => {
      if (active) toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
    });
    return () => { active = false; };
  }, [cachedReport, canViewStandardReports, teacherScoped, toast]);

  // The overview (or the selected archive) drives every indicator.
  useEffect(() => {
    if (!canViewStandardReports) {
      setIsLoading(false);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    setLoadError('');
    const load = archiveId
      ? cachedReport(`archive:${archiveId}`, () => studentsApi.getReportArchive(archiveId)).then((report) => {
        if (!active) return;
        setArchive(report);
        setOverview(report?.overviewReport || null);
      })
      : cachedReport(`overview:${from}:${to}:${scopeCommittee}`, () => studentsApi.getOverviewReport({ from, to, committeeId: scopeCommittee })).then((report) => {
        if (!active) return;
        setArchive(null);
        setOverview(report);
      });
    load.catch((error) => {
      if (active) setLoadError(error.message || 'تعذر تحميل الإحصائيات');
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [archiveId, cachedReport, canViewStandardReports, from, retry, scopeCommittee, to]);

  // The teacher points list is needed for its card itself.
  const loadList = useCallback((key, loader) => {
    setLists((current) => ({ ...current, [key]: { loading: true, rows: current[key]?.rows || [] } }));
    return loader()
      .then((rows) => setLists((current) => ({ ...current, [key]: { loading: false, rows: rows || [] } })))
      .catch((error) => setLists((current) => ({ ...current, [key]: { loading: false, rows: [], error: error.message || 'تعذر التحميل' } })));
  }, []);

  const listLoaders = useMemo(() => ({
    teacherPoints: () => cachedReport(`teacher-points:${from}:${to}`, () => studentsApi.getTeacherPointsReport({ from, to })).then((report) => report?.rows || []),
  }), [cachedReport, from, to]);

  useEffect(() => {
    setLists({});
    if (archiveId) return;
    if (canViewTeacherPoints) loadList('teacherPoints', listLoaders.teacherPoints);
  }, [archiveId, canViewStandardReports, canViewTeacherPoints, listLoaders, loadList, retry]);

  const metrics = useMemo(() => buildReportMetrics(overview, {
    lists,
    showStandard: canViewStandardReports,
    showTeacherPoints: canViewTeacherPoints && !archiveId,
    committee: detailCommittee,
  }), [archiveId, canViewStandardReports, canViewTeacherPoints, detailCommittee, lists, overview]);
  const detailCommittees = useMemo(() => detailCommitteesOf(overview), [overview]);
  const selected = metrics.find((metric) => metric.id === selectedId) || null;

  const periodLabel = archive
    ? archive.title
    : period === 'custom' ? `من ${from} إلى ${to}` : REPORT_PERIOD_LABELS[period];

  const openCustom = () => {
    setDraft(custom);
    setCustomOpen(true);
  };

  const changePeriod = (value) => {
    setSelectedId(null);
    if (value === 'custom') {
      openCustom();
      return;
    }
    setPeriod(value);
  };

  const applyCustom = () => {
    setCustom(draft);
    setPeriod('custom');
    setCustomOpen(false);
  };

  const deleteArchive = async () => {
    if (!archiveId) return;
    setIsDeletingArchive(true);
    try {
      await studentsApi.deleteReportArchive(archiveId);
      setArchives(await studentsApi.getReportArchives());
      setPeriod(DEFAULT_REPORT_PERIOD);
      toast({ title: 'تم حذف الأرشيف' });
    } catch (error) {
      toast({ title: 'تعذر حذف الأرشيف', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingArchive(false);
    }
  };

  const retryList = (key) => (key && listLoaders[key] ? loadList(key, listLoaders[key]) : setRetry((value) => value + 1));

  return (
    <PageLoadingBoundary>
      <div className="space-y-6 [font-family:var(--font-ui)]" dir="rtl" aria-busy={isLoading}>
        {!isOnline && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-200">
            تعرض الإحصائيات المحفوظة فقط دون إنترنت.
          </p>
        )}

        {/* The period sits on the right, next to the circle filter. */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={period} onValueChange={changePeriod}>
            <SelectTrigger aria-label="الفترة" className={controlClassName}>
              <SelectValue>{archive && archiveId ? archive.title : REPORT_PERIOD_LABELS[period] || periodLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
              {archives.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>الأرشيف</SelectLabel>
                    {archives.map((item) => (
                      <SelectItem key={item.id} value={`${ARCHIVE_PREFIX}${item.id}`}>{item.title}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <Button type="button" variant="outline" className="h-11 justify-between gap-2 sm:w-56" onClick={openCustom}>
              <span className="truncate text-sm">{periodLabel}</span>
            </Button>
          )}
          {canViewStandardReports && !archiveId && committees.length > 0 && (
            <Select value={committeeId} onValueChange={(value) => { setCommitteeId(value); setSelectedId(null); }}>
              <SelectTrigger aria-label="الحلقة" className={controlClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحلقات</SelectItem>
                {committees.map((committee) => (
                  <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {archive && archiveId && (
            <>
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">من {archive.periodFrom} إلى {archive.periodTo}</p>
              <Button type="button" variant="outline" disabled={!isOnline || isDeletingArchive} onClick={deleteArchive} className="h-11 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                حذف الأرشيف
              </Button>
            </>
          )}
        </div>

        {loadError && !overview ? (
          <ErrorState message={loadError} onRetry={() => setRetry((value) => value + 1)} />
        ) : isLoading && !overview && canViewStandardReports ? (
          <DashboardLoader className="py-16" />
        ) : (
          <>
            {loadError && <ErrorState message={loadError} onRetry={() => setRetry((value) => value + 1)} />}
            <section aria-label="مؤشرات الأداء" className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${isLoading ? 'opacity-60' : ''}`}>
              {metrics.filter(metric => !(teacherScoped && metric.id === 'committees' && Number(metric.countValue) <= 1)).map((metric) => (
                <MetricCard key={metric.id} metric={metric} onSelect={(item) => { setDetailCommittee(ALL_COMMITTEES); setSelectedId(item.id); }} />
              ))}
            </section>

            {canViewStandardReports && overview && (
              <RankingPanels bestStudents={overview.bestStudents} bestCommittees={overview.bestCommittees} hideCommittees={teacherScoped && (overview.bestCommittees || []).length <= 1} />
            )}

            {canViewStandardReports && overview && !teacherScoped && (
              <TeachersPanel teachers={overview.teachers} color="#0d9488" />
            )}
          </>
        )}

        <MetricDetails
          metric={selected}
          periodLabel={periodLabel}
          committees={detailCommittees}
          committee={detailCommittee}
          onCommitteeChange={setDetailCommittee}
          onClose={() => setSelectedId(null)}
          onRetry={() => retryList(selected?.id === 'points' ? 'teacherPoints' : selected?.id)}
        />

        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="sm:max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>فترة مخصصة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>من تاريخ</Label>
                <DashboardDatePicker value={draft.from} max={draft.to} onChange={(value) => setDraft((current) => ({ ...current, from: value }))} ariaLabel="من تاريخ" />
              </div>
              <div className="grid gap-1.5">
                <Label>إلى تاريخ</Label>
                <DashboardDatePicker value={draft.to} min={draft.from} onChange={(value) => setDraft((current) => ({ ...current, to: value }))} ariaLabel="إلى تاريخ" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={applyCustom}>تطبيق</Button>
              <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLoadingBoundary>
  );
};

export default ReportsSection;
