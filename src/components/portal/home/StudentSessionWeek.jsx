import React from 'react';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import { studentSessionResult, studentSessionGroupResult } from '@/lib/studentSessionResult';
import { planDayName, planTaskAmount, PLAN_TASK_LABELS } from '@/lib/studentPlan';

const columns = ['memorization', 'review', 'link'];

export default function StudentSessionWeek({ week, today }) {
  return <article className="student-session-week" dir="rtl">
    <header><h3>الأسبوع</h3><span dir="ltr">{week.start} — {week.end}</span></header>
    {week.days.filter(day => day.date <= today).map(day => <section key={day.date} className="student-session-day">
      <header><h4>{planDayName(day.date)}</h4>{day.points && <StudentPlanDayPoints points={day.points} />}</header>
      <div className="student-session-columns">{columns.map(type => <div key={type} className="student-session-track" data-track={type}>
        <h5>{PLAN_TASK_LABELS[type]}</h5>
        <div className="student-session-entries">{!day.tasks.some(task => task.taskType === type) && <span>—</span>}{(type === 'memorization'
          ? day.tasks.filter(task => task.taskType === type).map(task => [task])
          : [day.tasks.filter(task => task.taskType === type)].filter(tasks => tasks.length)
        ).map(tasks => {
          const task = tasks[0];
          const result = type === 'memorization' ? studentSessionResult(task) : studentSessionGroupResult(tasks);
          const evaluatedDate = tasks.map(item => String(item.evaluatedAt || '').slice(0, 10)).sort().at(-1);
          return <div key={task.id} className="student-session-entry">
            {(tasks.some(item => item.reviewExecution && !item.amountHidden) ? tasks.filter(item => item.reviewExecution) : tasks).filter(item => !item.amountHidden).map(item => <p key={item.id} className="student-session-amounts">{planTaskAmount(item) || '—'}</p>)}
            <span className="student-session-result" data-tone={result.tone}>{result.label}{evaluatedDate && evaluatedDate !== day.date && <small className="block text-xs font-normal">قُيّم بتاريخ <bdi>{evaluatedDate}</bdi></small>}</span>
          </div>;
        })}</div>
      </div>)}</div>
    </section>)}
  </article>;
}
