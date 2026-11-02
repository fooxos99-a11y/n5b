import React from 'react';
import { planTaskAmount } from '@/lib/studentPlan';
import { formatPointsNumber } from '@/lib/pointsFormat';

export default function RecitationAttemptHistory({ tasks = [] }) {
  const attempts = new Map();
  tasks.forEach(task => (task.previousAttempts || []).forEach(attempt => {
    const group = attempts.get(attempt.sessionId) || { number: attempt.attemptNumber, at: attempt.evaluatedAt, rows: [] };
    group.rows.push({ ...attempt, amount: planTaskAmount(task) });
    attempts.set(attempt.sessionId, group);
  }));
  if (!attempts.size) return null;
  return <details className="rounded-lg border border-border/60 px-2 text-xs text-muted-foreground">
    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">المحاولات السابقة ({attempts.size})</summary>
    <ol className="space-y-3 pb-3">
      {[...attempts.entries()].sort(([, a], [, b]) => Number(b.number) - Number(a.number)).map(([id, attempt]) => <li key={id}>
        <p className="font-semibold text-foreground">المحاولة {attempt.number} <time className="font-normal text-muted-foreground">{attempt.at}</time></p>
        {attempt.rows.map(row => <div key={row.id} className="mt-1 space-y-1">
          <p>{row.amount}</p>
          <p>{row.teacherCompleted ? 'مجتاز' : 'راسب'} · التقييم {formatPointsNumber(row.evaluationScore)} · {row.mistakeCount} أخطاء · {row.warningCount} تنبيهات · {row.hesitationCount} ترددات</p>
        </div>)}
      </li>)}
    </ol>
  </details>;
}
