import React, { useMemo, useState } from 'react';
import SectionTabs from '@/components/ui/section-tabs';
import { Button } from '@/components/ui/button';
import LoadingIndicator from '@/components/ui/loading-indicator';
import StudentSessionWeek from './StudentSessionWeek';
import StudentMemorized from './StudentMemorized';
import { buildStudentSessionWeeks } from '@/lib/studentSessionWeeks';
import PlanScheduleSummary from '../PlanScheduleSummary';
import '@/components/portal/student-plan.css';

const tabs = [{ value: 'evaluation', label: 'الجلسات' }, { value: 'saved', label: 'محفوظي' }];

export default function StudentSessions({ studentId, plan, today, onRead, tab, onTabChange, openJuzs, onJuzToggle }) {
  const [localTab, setLocalTab] = useState('evaluation');
  const selected = tab ?? localTab;
  const weeks = useMemo(() => buildStudentSessionWeeks({ weeklyGrades: plan.data?.weeklyGrades, rows: plan.data?.rows, todayData: plan.data?.today, points: plan.data?.points, today }), [plan.data, today]);
  return <SectionTabs items={tabs} value={selected} onChange={onTabChange || setLocalTab} label="أقسام الجلسات">
    {plan.data?.today?.plan && <div className="mb-3"><PlanScheduleSummary plan={plan.data.today.plan} /></div>}
    {selected === 'saved' ? <StudentMemorized studentId={studentId} onRead={onRead} openJuzs={openJuzs} onJuzToggle={onJuzToggle} /> : <>
      {plan.error && <div className="student-home-error" role="alert"><span>{plan.error}</span><Button variant="outline" onClick={plan.retry}>إعادة المحاولة</Button></div>}
      {plan.loading && !plan.data ? <div className="student-home-loading"><LoadingIndicator /></div> : <div className="student-home-evaluations">{weeks.map(week => <StudentSessionWeek key={week.start} week={week} today={today} />)}</div>}
    </>}
  </SectionTabs>;
}
