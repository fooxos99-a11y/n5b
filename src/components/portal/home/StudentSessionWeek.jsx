import React from 'react';
import StudentWeeklySessionResult from './StudentWeeklySessionResult';
import GradeScore from '@/components/dashboard/grades/GradeScore';
import { ATTENDANCE_LABELS } from '@/components/dashboard/grades/gradesFormat';
import { formatQuranRangeText } from '@/lib/quranRangeText';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import { studentSessionResult, studentSessionGroupResult } from '@/lib/studentSessionResult';
import { planDayName, planTaskAmount, PLAN_TASK_LABELS } from '@/lib/studentPlan';

const columns = ['memorization', 'review', 'link'];

export default function StudentSessionWeek({ week, today }) {
  return <article className="student-session-week" dir="rtl">
    <header><h3>الأسبوع</h3><span>{formatHijriDate(week.start)} — {formatHijriDate(week.end)}</span></header>
    <section className="student-session-part" aria-label="البرنامج الأسبوعي"><header><h4>البرنامج الأسبوعي</h4>{week.grade?.weeklyProgram && <GradeScore grade={week.grade.weeklyProgram.grade} max={week.grade.weeklyProgram.max} />}</header></section>
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
            <span className="student-session-result" data-tone={result.tone}>{result.label}{evaluatedDate && evaluatedDate !== day.date && <small className="block text-xs font-normal">قُيّم بتاريخ <bdi>{formatHijriDate(evaluatedDate)}</bdi></small>}</span>
          </div>;
        })}</div>
      </div>)}</div>
      <div className="student-session-records">
        {day.grading?.attendance && <div><h5 className="font-bold">الحضور</h5><p>{day.records?.attendance ? (ATTENDANCE_LABELS[day.records.attendance.detail?.status] || 'حُفظ الحضور') : 'بانتظار تسجيل الحضور'}</p>{day.records?.attendance && <GradeScore grade={day.records.attendance.grade} max={day.records.attendance.max} />}</div>}
        {day.grading?.reading && <div><h5 className="font-bold">المقدار الذاتي</h5>
          {day.records?.reading?.detail && <>
            <p>{day.records.reading.detail.hizbCount ? `${day.records.reading.detail.hizbCount} أحزاب` : `${day.records.reading.detail.requiredFaces} أوجه`}</p>
            {(day.records.reading.detail.ranges || (day.records.reading.detail.range ? [day.records.reading.detail.range] : [])).map((range, index) => <p key={index}>{formatQuranRangeText(range)}</p>)}
          </>}
          <p>{day.records?.reading ? day.records.reading.passed ? 'مكتمل' : 'لم يكتمل' : 'بانتظار التسجيل'}</p>
          {day.records?.reading && <GradeScore grade={day.records.reading.grade} max={day.records.reading.max} />}
        </div>}
      </div>
    </section>)}
    <StudentWeeklySessionResult week={week} component="track" today={today} />
    <StudentWeeklySessionResult week={week} component="weekly" today={today} />
  </article>;
}
