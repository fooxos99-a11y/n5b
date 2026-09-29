import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  ListChecks,
  PauseCircle,
  Settings2,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import OwnerAnalyticsFilters from '@/components/owner/OwnerAnalyticsFilters';
import OwnerComplexAnalyticsTable from '@/components/owner/OwnerComplexAnalyticsTable';
import OwnerErrorState from '@/components/owner/OwnerErrorState';
import OwnerMetricCard from '@/components/owner/OwnerMetricCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { platformApi } from '@/services/platformApi';
import { getBusinessDate } from '../../../shared/business-date.js';

const OwnerTrendChart = React.lazy(() => import('@/components/owner/OwnerTrendChart'));

const today = getBusinessDate;
const number = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });
const percent = (value) => `${number(value)}%`;
const rankingOptions = {
  attendanceRate: { label: 'نسبة الحضور', format: percent },
  executionRate: { label: 'تنفيذ مهام الفترة', format: percent },
  quranFacesTotal: { label: 'الإنجاز', format: number },
  activeStudentsCount: { label: 'انتظام الطلاب', format: number },
};

const groupTrend = (rows, days) => {
  if (days <= 45) return rows;
  const mode = days > 180 ? 'month' : 'week';
  const map = new Map();
  rows.forEach((row) => {
    const date = new Date(`${row.date}T00:00:00Z`);
    const key = mode === 'month'
      ? row.date.slice(0, 7)
      : new Date(date.setUTCDate(date.getUTCDate() - date.getUTCDay())).toISOString().slice(0, 10);
    const current = map.get(key) || { date: key };
    Object.entries(row).forEach(([field, value]) => { if (field !== 'date') current[field] = Number(current[field] || 0) + Number(value || 0); });
    map.set(key, current);
  });
  return [...map.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const buildAlerts = (complexes) => complexes.flatMap((complex) => {
  if (!complex.available) return [{ id: `${complex.id}-unavailable`, name: complex.name, text: 'تعذر قراءة بيانات هذا المجمع.' }];
  const current = complex.stats;
  const previous = complex.previousStats;
  const alerts = [];
  if (previous && previous.attendanceRate - current.attendanceRate >= 8) alerts.push({ id: `${complex.id}-attendance`, name: complex.name, text: `انخفض الحضور من ${percent(previous.attendanceRate)} إلى ${percent(current.attendanceRate)}.` });
  if (current.absenceRate >= 20) alerts.push({ id: `${complex.id}-absence`, name: complex.name, text: `بلغت نسبة الغياب ${percent(current.absenceRate)}.` });
  if (current.delayedStudentsCount > 0) alerts.push({ id: `${complex.id}-plans`, name: complex.name, text: `${number(current.delayedStudentsCount)} طالب متأخر عن خطته.` });
  if (previous && previous.executionRate - current.executionRate >= 10) alerts.push({ id: `${complex.id}-execution`, name: complex.name, text: `انخفض تنفيذ مهام الفترة بمقدار ${number(previous.executionRate - current.executionRate)} نقطة.` });
  return alerts;
}).slice(0, 12);

const OwnerAnalyticsSection = ({ complexes: availableComplexes, onOpenComplex, onOpenSettings }) => {
  const { toast } = useToast();
  const initialDate = today();
  const [filters, setFilters] = useState({ from: initialDate, to: initialDate, compare: '', complexIds: [], committeeId: '', teacherId: '' });
  const [rankingKey, setRankingKey] = useState('attendanceRate');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!filters.from || !filters.to || filters.from > filters.to) {
      setError('نطاق التاريخ غير صحيح.');
      setIsLoading(false);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    setError('');
    const timeout = window.setTimeout(() => {
      platformApi.getAnalytics(filters)
        .then((result) => { if (active) setData(result); })
        .catch((requestError) => {
          if (!active) return;
          setError(requestError.message || 'تعذر تحميل التحليلات.');
          toast({ title: 'تعذر تحميل التحليلات', description: requestError.message, variant: 'destructive' });
        })
        .finally(() => { if (active) setIsLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [filters, requestVersion, toast]);

  const totals = data?.totals || {};
  const previous = data?.previousTotals ?? null;
  const rows = useMemo(() => (data?.complexes || []).filter((row) => row.available), [data?.complexes]);
  const ranked = useMemo(() => [...rows].sort((left, right) => Number(right.stats[rankingKey] || 0) - Number(left.stats[rankingKey] || 0)), [rankingKey, rows]);
  const alerts = useMemo(() => buildAlerts(data?.complexes || []), [data?.complexes]);
  const attendanceTrend = groupTrend(data?.trends?.attendance || [], data?.period?.days || 1);
  const studentTrend = groupTrend(data?.trends?.students || [], data?.period?.days || 1);
  const quranTrend = groupTrend(data?.trends?.quran || [], data?.period?.days || 1);
  const planTotal = Number(totals.plansCount || 0);
  const completedShare = planTotal ? Math.min(100, (Number(totals.completedPlansCount || 0) / planTotal) * 100) : 0;

  const _resolveOwnerAnalyticsSection = () => {
    if (isLoading) {
      return <DashboardLoader className="min-h-[520px]" />;
    }
    if (error) {
      return <OwnerErrorState message={error} onRetry={() => setRequestVersion((value) => value + 1)} />;
    }
    if (data) {
      return <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OwnerMetricCard icon={GraduationCap} label="إجمالي الطلاب" value={number(totals.studentsCount)} rawValue={totals.studentsCount} previousValue={previous?.studentsCount} />
            <OwnerMetricCard icon={UserCheck} label="الطلاب النشطون" value={number(totals.activeStudentsCount)} rawValue={totals.activeStudentsCount} previousValue={previous?.activeStudentsCount} tone="text-emerald-600" />
            <OwnerMetricCard icon={UserPlus} label="الطلاب الجدد" value={number(totals.newStudentsCount)} rawValue={totals.newStudentsCount} previousValue={previous?.newStudentsCount} tone="text-sky-600" />
            <OwnerMetricCard icon={Building2} label="المجمعات" value={number(rows.length)} rawValue={rows.length} />
            <OwnerMetricCard icon={ListChecks} label="الحلق" value={number(totals.committeesCount)} rawValue={totals.committeesCount} previousValue={previous?.committeesCount} />
            <OwnerMetricCard icon={Users} label="المعلمون" value={number(totals.teachersCount)} rawValue={totals.teachersCount} previousValue={previous?.teachersCount} />
            <OwnerMetricCard icon={CalendarCheck} label="نسبة الحضور" value={percent(totals.attendanceRate)} rawValue={totals.attendanceRate} previousValue={previous?.attendanceRate} tone="text-emerald-600" />
            <OwnerMetricCard icon={Target} label="تنفيذ مهام الفترة" value={percent(totals.executionRate)} rawValue={totals.executionRate} previousValue={previous?.executionRate} tone="text-violet-600" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <React.Suspense fallback={<DashboardLoader className="min-h-72" />}><OwnerTrendChart title="تطور نشاط الطلاب" data={studentTrend} series={[{ key: 'active', label: 'النشطون', color: '#0f766e' }, { key: 'newStudents', label: 'الجدد', color: '#0284c7' }]} /></React.Suspense>
            <React.Suspense fallback={<DashboardLoader className="min-h-72" />}><OwnerTrendChart title="الحضور والغياب عبر الزمن" data={attendanceTrend} series={[{ key: 'present', label: 'الحضور', color: '#16a34a' }, { key: 'absent', label: 'الغياب', color: '#dc2626' }, { key: 'late', label: 'التأخر', color: '#d97706' }]} /></React.Suspense>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OwnerMetricCard icon={CalendarCheck} label="مرات الحضور" value={number(totals.presentCount)} rawValue={totals.presentCount} previousValue={previous?.presentCount} tone="text-emerald-600" />
            <OwnerMetricCard icon={XCircle} label="نسبة الغياب" value={percent(totals.absenceRate)} rawValue={totals.absenceRate} previousValue={previous?.absenceRate} positiveWhenDown tone="text-red-600" />
            <OwnerMetricCard icon={Clock3} label="نسبة التأخر" value={percent(totals.lateRate)} rawValue={totals.lateRate} previousValue={previous?.lateRate} positiveWhenDown tone="text-amber-600" />
            <OwnerMetricCard icon={TrendingUp} label="متوسط الحضور اليومي" value={number(totals.averageDailyAttendance)} rawValue={totals.averageDailyAttendance} previousValue={previous?.averageDailyAttendance} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <React.Suspense fallback={<DashboardLoader className="min-h-72" />}><OwnerTrendChart title="الحفظ والمراجعة" data={quranTrend} series={[{ key: 'memorization', label: 'الحفظ', color: '#0f766e' }, { key: 'mastery', label: 'الإتقان', color: '#8b5cf6' }, { key: 'review', label: 'المراجعة', color: '#7c3aed' }, { key: 'link', label: 'الربط', color: '#0284c7' }, { key: 'repeatFaces', label: 'التكرار', color: '#d97706' }]} /></React.Suspense>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="border-b border-border/70 p-4"><h3 className="font-black text-foreground">تحليل الإنجاز</h3></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                {[
                  ['إجمالي الإنجاز', totals.quranFacesTotal], ['الحفظ', totals.memorizationFaces], ['الإتقان', totals.masteryFaces], ['المراجعة', totals.reviewFaces],
                  ['التكرار', totals.repeatFaces], ['الربط', totals.linkFaces], ['متوسط الطالب', totals.averageStudentAchievement],
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-3 text-center"><strong className="block text-lg font-black text-foreground">{number(value)}</strong><span className="text-xs font-bold text-muted-foreground">{label}</span></div>)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="border-b border-border/70 p-4"><h3 className="font-black text-foreground">حالة الخطط</h3></CardHeader>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[160px_1fr] sm:items-center">
                <div className="mx-auto grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#0f766e ${completedShare}%, hsl(var(--muted)) 0)` }} role="img" aria-label={`نسبة الخطط المكتملة ${percent(completedShare)}`}>
                  <div className="grid h-24 w-24 place-items-center rounded-full bg-card text-center"><span><strong className="block text-xl font-black">{percent(completedShare)}</strong><small className="font-bold text-muted-foreground">مكتملة</small></span></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [ClipboardCheck, 'الخطط', totals.plansCount, 'text-primary'], [CheckCircle2, 'مكتملة', totals.completedPlansCount, 'text-emerald-600'],
                    [Target, 'جارية', totals.activePlansCount, 'text-sky-600'], [PauseCircle, 'متوقفة', totals.pausedPlansCount, 'text-amber-600'],
                    [Clock3, 'متأخرة', totals.delayedPlansCount, 'text-red-600'], [UserCheck, 'حققوا أهدافًا', totals.achievedStudentsCount, 'text-violet-600'],
                    [TrendingUp, 'إنجاز الخطة', percent(totals.planProgressRate), 'text-primary'], [CalendarCheck, 'الالتزام حتى اليوم', percent(totals.planAdherenceRate), 'text-emerald-600'],
                  ].map(([Icon, label, value, tone]) => <div key={label} className="rounded-xl border border-border/70 p-2.5"><Icon className={`h-4 w-4 ${tone}`} /><strong className="mt-1 block">{typeof value === 'string' ? value : number(value)}</strong><span className="text-[11px] font-bold text-muted-foreground">{label}</span></div>)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/70 p-4">
                <h3 className="font-black text-foreground">ترتيب المجمعات</h3>
                <Select value={rankingKey} onValueChange={setRankingKey}>
                  <SelectTrigger aria-label="معيار ترتيب المجمعات" className="h-11 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(rankingOptions).map(([value, option]) => <SelectItem key={value} value={value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                {ranked.map((complex, index) => {
                  const value = Number(complex.stats[rankingKey] || 0);
                  const max = Number(ranked[0]?.stats?.[rankingKey] || 1);
                  return <button key={complex.id} type="button" className="block min-h-14 w-full rounded-xl border border-border/70 p-3 text-right hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => onOpenComplex(complex.id)}>
                    <span className="flex items-center justify-between gap-3"><strong><span className="me-2 text-primary">{['🥇', '🥈', '🥉'][index] || `#${number(index + 1)}`}</span>{complex.name}</strong><b>{rankingOptions[rankingKey].format(value)}</b></span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} /></span>
                  </button>;
                })}
                {!ranked.length ? <p className="py-8 text-center font-bold text-muted-foreground">لا توجد بيانات قابلة للترتيب.</p> : null}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="border-b border-border/70 p-4"><h3 className="flex items-center gap-2 font-black text-foreground"><AlertTriangle className="h-5 w-5 text-amber-600" />تحتاج إلى متابعة</h3></CardHeader>
              <CardContent className="space-y-2 p-4">
                {alerts.map((alert) => <div key={alert.id} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><strong className="block text-sm text-foreground">{alert.name}</strong><p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">{alert.text}</p></div>)}
                {!alerts.length ? <div className="grid min-h-48 place-items-center text-center font-bold text-emerald-600">لا توجد حالات حرجة مكتشفة خلال الفترة.</div> : null}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader className="border-b border-border/70 p-4"><h3 className="font-black text-foreground">أفضل الطلاب إنجازًا</h3></CardHeader>
            <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-5">
              {(data.leaders || []).slice(0, 10).map((leader, index) => <div key={`${leader.complexId}-${leader.id}`} className="rounded-xl border border-border/70 p-3"><span className="text-xs font-black text-primary">#{number(index + 1)}</span><strong className="mt-1 block truncate text-sm">{leader.name}</strong><small className="block truncate font-bold text-muted-foreground">{leader.complexName} · {leader.committeeName || '-'}</small><b className="mt-2 block text-sm text-emerald-600">{number(leader.achievedFaces)} وجه</b></div>)}
              {!data.leaders?.length ? <p className="col-span-full py-8 text-center font-bold text-muted-foreground">لا توجد إنجازات مسجلة خلال الفترة.</p> : null}
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 text-lg font-black text-foreground">تحليل أداء جميع المجمعات</h3>
            <OwnerComplexAnalyticsTable complexes={rows} onOpenComplex={onOpenComplex} />
          </div>

        </>;
    }
    return null;
  };
  return (
    <section className="space-y-5 [font-family:var(--font-ui)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-foreground sm:text-2xl">الإحصائيات والتحليلات</h2>
        <Button type="button" variant="outline" className="h-11 gap-2" onClick={onOpenSettings}>
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          الإعدادات
        </Button>
      </div>
      <OwnerAnalyticsFilters filters={filters} complexes={availableComplexes} filterOptions={data?.filterOptions} onChange={setFilters} />

      {_resolveOwnerAnalyticsSection()}
    </section>
  );
};

export default OwnerAnalyticsSection;
