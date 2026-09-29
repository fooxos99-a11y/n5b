import React, { useEffect, useMemo } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import StudentPlanProgress from '@/components/portal/StudentPlanProgress';
import DashboardHeaderContent from '@/components/dashboard/DashboardHeaderContent';
import StudentPlanWeek from '@/components/portal/StudentPlanWeek';
import useSaudiClock from '@/hooks/useSaudiClock';
import useStudentPlan from '@/hooks/useStudentPlan';
import { getBusinessDate } from '../../../shared/business-date.js';
import { buildStudentPlanWeeks } from '@/lib/studentPlan';
import './student-plan.css';

export default function StudentPlanPanel({ studentId, onOpenAmount, onPointsChange }) {
  const clock = useSaudiClock();
  const today = getBusinessDate(clock);
  const { data, loading, error, retry } = useStudentPlan(studentId, today);
  const weeks = useMemo(() => buildStudentPlanWeeks({ rows: data?.rows, todayData: data?.today, points: data?.points, today }), [data, today]);
  useEffect(() => { onPointsChange?.(data?.points?.total ?? null); }, [data?.points?.total, onPointsChange]);
  if (loading && !data) return <DashboardLoader />;
  return (
    <div className="student-plan" dir="rtl">
      <h1 className="sr-only">خطتي</h1>
      {error && <div role="alert" className="student-plan-error"><span>{error}</span><Button type="button" variant="outline" className="min-h-11" onClick={retry}>إعادة المحاولة</Button></div>}
      {data && <>
        <DashboardHeaderContent><StudentPlanProgress plan={data.today?.plan} /></DashboardHeaderContent>
        {!data.today?.plan && <p className="student-plan-empty">لا توجد خطة حالية.</p>}
        {weeks.map((week) => <StudentPlanWeek key={week.start} week={week} today={today} onOpenAmount={onOpenAmount} />)}
      </>}
    </div>
  );
}
