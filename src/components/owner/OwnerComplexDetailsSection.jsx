import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  ListChecks,
  ShoppingBag,
  Star,
  Users,
} from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import OwnerPeriodFilter from '@/components/owner/OwnerPeriodFilter';
import OwnerErrorState from '@/components/owner/OwnerErrorState';
import OwnerStatCard from '@/components/owner/OwnerStatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { platformApi } from '@/services/platformApi';

const number = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const percent = (value) => `${number(value)}%`;
const attendanceLabels = { present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب' };
const taskLabels = { memorization: 'الحفظ', repeat: 'التكرار', link: 'الربط', review: 'المراجعة' };
const statusLabels = { active: 'مفعّل', inactive: 'متوقف', pending: 'قيد التجهيز' };

const formatDateTime = (value) => value ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value)) : '-';

const OwnerComplexDetailsSection = ({ complexId, onBack }) => {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    setError('');
    platformApi.getComplexOverview(complexId, days)
      .then(setData)
      .catch((requestError) => {
        setError(requestError.message || 'تعذر تحميل تفاصيل المجمع.');
        toast({ title: 'تعذر تحميل تفاصيل المجمع', description: requestError.message, variant: 'destructive' });
      })
      .finally(() => setIsLoading(false));
  }, [complexId, days, requestVersion, toast]);

  if (isLoading) return <DashboardLoader className="min-h-[420px]" />;
  if (error) return <OwnerErrorState message={error} onRetry={() => setRequestVersion((value) => value + 1)} className="min-h-[420px]" />;
  if (!data) return null;

  const stats = data.stats || {};
  const complex = data.complex || {};

  return (
    <section className="space-y-5 [font-family:var(--font-ui)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={onBack} aria-label="العودة إلى النظرة العامة">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black text-foreground sm:text-2xl">{complex.name}</h2>
            <p className="text-xs font-bold text-muted-foreground">رقم المجمع: {complex.registrationNumber} · {statusLabels[complex.status] || complex.status}</p>
          </div>
        </div>
        <OwnerPeriodFilter value={days} onChange={setDays} />
      </div>

      {!data.available ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center font-bold text-red-600">تعذر قراءة قاعدة بيانات هذا المجمع.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <OwnerStatCard icon={GraduationCap} label="الطلاب" value={number(stats.studentsCount)} />
            <OwnerStatCard icon={Users} label="المعلمون والإداريون" value={number(stats.supervisorsCount)} />
            <OwnerStatCard icon={Building2} label="الحلقات" value={number(stats.committeesCount)} />
            <OwnerStatCard icon={GraduationCap} label="الطلاب النشطون" value={number(stats.activeStudentsCount)} />
            <OwnerStatCard icon={CalendarDays} label="نسبة الحضور" value={percent(stats.attendanceRate)} tone="text-emerald-600" />
            <OwnerStatCard icon={CheckCircle2} label="تنفيذ مهام الفترة" value={percent(stats.executionRate)} tone="text-sky-600" />
            <OwnerStatCard icon={ListChecks} label="جلسات التسميع" value={number(stats.recitationsCount)} tone="text-violet-600" />
            <OwnerStatCard icon={ShoppingBag} label="طلبات المتجر" value={number(stats.storeOrdersCount)} tone="text-amber-600" />
            <OwnerStatCard icon={Star} label="إجمالي النقاط" value={number(stats.pointsTotal)} tone="text-amber-600" />
            <OwnerStatCard icon={Activity} label="نشاط الفترة" value={number(stats.activityCount)} tone="text-violet-600" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/70 bg-card">
              <CardHeader className="border-b border-border/70 p-4 text-base font-black text-foreground">الحضور</CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {Object.entries(attendanceLabels).map(([key, label]) => (
                  <div key={key} className="rounded-xl bg-background p-3 text-center">
                    <div className="text-lg font-black text-foreground">{number(data.attendance?.[key])}</div>
                    <div className="text-xs font-bold text-muted-foreground">{label}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card">
              <CardHeader className="border-b border-border/70 p-4 text-base font-black text-foreground">تنفيذ مهام الفترة</CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {Object.entries(taskLabels).map(([key, label]) => {
                  const task = data.tasks?.[key] || {};
                  return (
                    <div key={key} className="rounded-xl bg-background p-3 text-center">
                      <div className="text-lg font-black text-foreground">{number(task.done)} / {number(task.total)}</div>
                      <div className="text-xs font-bold text-muted-foreground">{label}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card">
            <CardHeader className="border-b border-border/70 p-4 text-base font-black text-foreground">الحلقات</CardHeader>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.committees?.length ? data.committees.map((committee) => (
                <div key={committee.id} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                  <span className="min-w-0 truncate text-sm font-black text-foreground">{committee.name}</span>
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">{number(committee.studentsCount)} طالب</span>
                </div>
              )) : <div className="p-5 text-center font-bold text-muted-foreground">لا توجد حلقات.</div>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
            <Card className="border-border/70 bg-card">
              <CardHeader className="border-b border-border/70 p-4 text-base font-black text-foreground">آخر النشاطات</CardHeader>
              <CardContent className="divide-y divide-border/70 p-0">
                {data.recentActivity?.length ? data.recentActivity.map((activity, index) => (
                  <div key={`${activity.createdAt}-${index}`} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-black text-foreground">{activity.action}</span>
                      <span className="block text-xs font-bold text-muted-foreground">{activity.actorName}</span>
                    </span>
                    <time className="shrink-0 text-[11px] font-bold text-muted-foreground">{formatDateTime(activity.createdAt)}</time>
                  </div>
                )) : <div className="p-6 text-center font-bold text-muted-foreground">لا يوجد نشاط في الفترة المحددة.</div>}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card">
              <CardHeader className="border-b border-border/70 p-4 text-base font-black text-foreground">بيانات المجمع</CardHeader>
              <CardContent className="space-y-3 p-4 text-sm font-bold">
                <div><span className="text-muted-foreground">المدير:</span> {complex.managerName || '-'}</div>
                <div><span className="text-muted-foreground">جهة التواصل:</span> {complex.contactName || '-'}</div>
                <div><span className="text-muted-foreground">رقم التواصل:</span> {complex.contactPhone || '-'}</div>
                <div><span className="text-muted-foreground">تاريخ الإنشاء:</span> {formatDateTime(complex.createdAt)}</div>
                <div><span className="text-muted-foreground">آخر تحديث:</span> {formatDateTime(data.updatedAt)}</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
};

export default OwnerComplexDetailsSection;
