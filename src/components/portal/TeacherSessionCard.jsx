import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import StudentPlanFeedback from '@/components/portal/StudentPlanFeedback';
import { studentSessionGroupResult, groupSessionTasksByGradeDate } from '@/lib/studentSessionResult';
import { planDayName, planTaskAmount } from '@/lib/studentPlan';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

const tracks = [
  ['memorization', 'الحفظ', task => task.taskType === 'memorization' && task.track !== 'mastery'],
  ['review', 'المراجعة', task => task.taskType === 'review'],
  ['link', 'الربط', task => task.taskType === 'link'],
];

export default function TeacherSessionCard({ day }) {
  return <Card className="min-w-0 rounded-2xl border-border bg-card [font-family:var(--font-ui)]" dir="rtl" data-teacher-session>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 p-4 space-y-0">
      <div className="min-w-0"><h3 className="text-sm font-bold">{planDayName(day.date)}</h3><time className="text-xs text-muted-foreground" dateTime={day.date}>{formatHijriDate(day.date)}</time></div>
      <StudentPlanDayPoints points={day.points} />
    </CardHeader>
    <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
      {tracks.map(([key, label, matches]) => <section key={key} className="min-w-0 rounded-xl bg-muted/40 p-3">
        <h4 className="mb-2 text-xs font-bold text-primary">{label}</h4>
        <div className="space-y-3">{day.tasks.some(matches) ? groupSessionTasksByGradeDate(day.tasks.filter(matches)).map(tasks => {
          const result = studentSessionGroupResult(tasks);
          return <div key={`${tasks[0].taskDate}:${tasks[0].id}`} className="space-y-2 text-xs leading-6">
            {tasks.map(task => <p key={task.id} className="break-words text-muted-foreground">{planTaskAmount(task) || '—'}</p>)}
            <p className="font-bold" data-tone={result.tone}>{result.label}</p>
            <StudentPlanFeedback tasks={tasks} showRating={false} showCounts={false} />
          </div>;
        }) : <span className="text-xs text-muted-foreground">—</span>}</div>
      </section>)}
    </CardContent>
  </Card>;
}
