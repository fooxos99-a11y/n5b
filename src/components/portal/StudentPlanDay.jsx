import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import React from 'react';
import { Button } from '@/components/ui/button';
import StudentPlanFeedback from '@/components/portal/StudentPlanFeedback';
import { PLAN_TASK_TYPES, PLAN_TASK_LABELS, buildPlanMushafTarget, planDayName, planCompactAmount, planTaskAmount, planTaskCompleted } from '@/lib/studentPlan';

export default function StudentPlanDay({ day, today, onOpenAmount, preview = false, readOnly = false }) {
  const Amount = readOnly ? 'div' : Button;
  const isToday = day.date === today;
  const _resolveConditional = () => {
    if (preview) {
      return 'غدًا';
    }
    if (isToday) {
      return 'اليوم';
    }
    return planDayName(day.date);
  };
  return (
    <article className="student-plan-day" aria-label={preview ? 'مقدار الغد' : undefined} data-current={isToday} data-plan-date={day.date}>
      <div className="student-plan-day-heading">
        <h3>{_resolveConditional()}</h3>
      </div>
      <div className="student-plan-amounts">
        {PLAN_TASK_TYPES.map((type, column) => {
          const tasks = day.tasks.filter((task) => task.taskType === type);
          const hidden = tasks.some((task) => task.amountHidden);
          const label = PLAN_TASK_LABELS[type];
          const target = buildPlanMushafTarget(tasks, label);
          const complete = tasks.length > 0 && tasks.every(planTaskCompleted);
          const _resolveAriaLabel = () => {
            if (hidden) {
              return label;
            }
            return `${label} — ${tasks.map(planTaskAmount).join('، ') || 'لا يوجد مقدار'}${complete ? ' — مكتمل' : ''}`;
          };
          return (
            <div key={type} className="student-plan-task" data-kind={type} style={{ '--plan-task-column': column + 1 }}>
            <Amount {...(readOnly ? {} : { type: 'button', variant: 'ghost', disabled: !target, onClick: () => onOpenAmount?.(target) })} className="student-plan-amount" data-completed={complete} aria-label={_resolveAriaLabel()}>
              <span className="student-plan-amount-line" title={hidden ? undefined : `${label}: ${tasks.map(planTaskAmount).join('، ') || '—'}`}>
                <span className="student-plan-amount-title">{label}: </span>
                {!hidden && <span className="student-plan-amount-range">{tasks.length ? tasks.map(planCompactAmount).join('، ') : '—'}</span>}
              </span>
              {type === 'memorization' && tasks.length > 0 && <span className="student-plan-counts">
                {tasks.map((task) => {
                  const repeat = isToday || preview ? task.repeatCount ?? task.actualRepeatCount : task.actualRepeatCount;
                  const listening = isToday || preview ? task.listeningCount ?? task.actualListeningCount : task.actualListeningCount;
                  return <span key={task.id}>
                    <span>التكرار: {repeat ?? '—'}</span>
                    <span>السماع: {listening ?? '—'}</span>
                  </span>;
                })}
              </span>}
            </Amount>
            <StudentPlanFeedback tasks={tasks} />
            </div>
          );
        })}
      </div>
      {!preview && day.date <= today && day.points && <div className="col-span-2 min-w-0"><StudentPlanDayPoints points={day.points} /></div>}
    </article>
  );
}
